import { Hono } from "hono";
import { Resend } from "resend";
import {
  customerInfoValidator,
  orderInfoValidator,
  orderLookupValidator,
  orderStatusValidator,
  uuidValidator,
} from "../middleware/validators";
import { getDB } from "../../utils/db";
import { adminAuth } from "../middleware/auth";
import { notifyProductRevalidation } from "../lib/revalidate";

const orders = new Hono();

async function sendOrderConfirmationEmail(env, orderNumber, customerName, email) {
  const apiKey = env?.RESEND_API_KEY;
  const from = env?.EMAIL_FROM || "onboarding@resend.dev";

  if (!apiKey || !email) {
    return;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: [email],
      subject: `Your Koalas Bakery order ${orderNumber} is confirmed`,
      html: `
        <p>Hi ${customerName},</p>
        <p>Your order <strong>${orderNumber}</strong> has been placed successfully.</p>
        <p>We will keep you updated as it moves through preparation and delivery.</p>
        <p>Thanks for shopping with Koalas Bakery.</p>
      `,
      text: `Hi ${customerName}, your order ${orderNumber} has been placed successfully. Thanks for shopping with Koalas Bakery.`,
    });
  } catch (error) {
    console.error("Resend email failed:", error);
  }
}

orders.use("/all", adminAuth);
orders.use("/:id/:status", adminAuth);
orders.use("/:id", async (c, next) => {
  if (c.req.method === "DELETE") return adminAuth(c, next);
  await next();
});

orders.get("/all", async (c) => {
  const db = getDB(c);

  const { data, error } = await db
    .from("orders")
    .select(
      `
      *,
      items:order_items(
        quantity,
        price_at_time,
        size,
        product:products(
          id,
          name,
          type,
          image_url
        )
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: "Orders not retrieved" }, 500);

  return c.json(data ?? [], 200);
});

orders.post("/lookup", orderLookupValidator, async (c) => {
  const db = getDB(c);
  const { email, phone, order_id } = c.req.valid("json");

  const { data, error } = await db
    .from("orders")
    .select(
      `
      *,
      items:order_items(
        quantity,
        price_at_time,
        size,
        product:products(
          id,
          name,
          type,
          image_url
        )
      )
    `,
    )
    .eq("phone", phone.trim())
    .eq("email", email.trim().toLowerCase())
    .eq("order_number", order_id.trim())
    .maybeSingle();

  if (error) return c.json({ error: "Order not retrieved" }, 500);
  if (!data) {
    return c.json({ error: "Order not found" }, 404);
  }

  return c.json(data, 200);
});

orders.post("", orderInfoValidator, async (c) => {
  const db = getDB(c);
  const body = c.req.valid("json");

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const randomBytes = new Uint8Array(2);
  crypto.getRandomValues(randomBytes);
  const randomCode = Array.from(randomBytes, (b) => b.toString(36))
    .join("")
    .toUpperCase()
    .slice(0, 4);
  const orderNumber = `KB-${mm}${dd}-${randomCode}`;

  // Sort IDs natively to utilize C++ fast-path
  const uniqueProductIds = Array.from(
    new Set(body.products.map((p) => p.productId)),
  ).sort();

  // Sort body in-place to ensure DB locks rows in the same order (Zero deadlocks)
  body.products.sort((a, b) =>
    a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
  );

  const { data: productsData, error: productsError } = await db
    .from("products")
    .select("id, price, stock, size, max_purchasable_limit")
    .in("id", uniqueProductIds);

  if (productsError) return c.json({ error: "Order placement failed" }, 500);
  if (!productsData || productsData.length !== uniqueProductIds.length) {
    return c.json({ error: "Order placement failed" }, 400);
  }

  const dbProductMap = new Map(productsData.map((p) => [p.id, p]));

  let totalPrice = 0;

  for (const bodyProduct of body.products) {
    const dbProduct = dbProductMap.get(bodyProduct.productId)!;

    if (
      (dbProduct.size?.length > 0 &&
        !dbProduct.size.includes(bodyProduct.size)) ||
      bodyProduct.quantity > dbProduct.stock ||
      bodyProduct.quantity > dbProduct.max_purchasable_limit
    ) {
      return c.json({ error: "Invalid product quantity/size" }, 400);
    }

    totalPrice += dbProduct.price * bodyProduct.quantity;
  }

  totalPrice = Math.round(totalPrice * 100) / 100;

  // Build payload for RPC (order_id is handled natively by DB)
  const orderItems = body.products.map((item) => ({
    product_id: item.productId,
    size: item.size ?? null,
    quantity: item.quantity,
    price_at_time: dbProductMap.get(item.productId)!.price,
  }));

  // Fire the single atomic transaction
  const { error: rpcError } = await db.rpc("place_order", {
    p_order_number: orderNumber,
    p_customer_name: body.customer_name,
    p_phone: body.phone,
    p_email: body.email,
    p_address: body.address,
    p_total_price: totalPrice,
    p_items: orderItems,
  });

  if (rpcError) return c.json({ error: "Order placement failed" }, 500);

  c.executionCtx.waitUntil(
    sendOrderConfirmationEmail(
      c.env,
      orderNumber,
      body.customer_name,
      body.email,
    ),
  );

  notifyProductRevalidation(
    c.env,
    c.executionCtx.waitUntil.bind(c.executionCtx),
  );

  return c.json({ order_number: orderNumber }, 201);

  /*
   * get all products mentioned in body
   * store them in products array one by one
   * mutliply the prices with quantity of individual products then add up all the answers from previous calculation
   * insert new row orders row and return the id for it with generated orderNumber, customer_name, phone, address, and total_price from the recent most calculation
   * insert new order_items rows for each product with newly made order_id and already fetched product_id with its price and the quantity from request body
   */
});

orders.patch("/:id/:status", orderStatusValidator, async (c) => {
  const db = getDB(c);

  const { id, status } = c.req.valid("param");

  const { data, error } = await db
    .from("orders")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) return c.json({ error: "Status update failed" }, 500);
  if (!data || data.length === 0)
    return c.json({ error: "Order not found" }, 404);

  return c.body(null, 200);
});

orders.delete("/:id", uuidValidator, async (c) => {
  const db = getDB(c);

  const { id } = c.req.valid("param");

  const { count, error } = await db
    .from("orders")
    .update({ status: "cancelled" }, { count: "exact" })
    .eq("id", id)
    .eq("status", "placed");

  if (error) return c.json({ error: "Cancellation failed" }, 500);

  if (count === 0) {
    return c.json({ error: "Order cannot be cancelled or was not found" }, 400);
  }

  return c.body(null, 204);
});

/**
 * placed
 * preparing
 * out for delivery
 * delivered
 * cancelled
 * returned/refunded
 *
 * custom status
 */

export default orders;
