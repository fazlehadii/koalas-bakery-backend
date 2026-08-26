import { Hono } from "hono";
import {
  customerInfoValidator,
  orderInfoValidator,
  orderNumberValidator,
} from "../middleware/validators";
import { getDB } from "../../utils/db";

const orders = new Hono();

orders.get("", async (c) => {
  const db = getDB(c);

  const { data, error } = await db.from("orders").select("*").maybeSingle();

  if (error) return c.json({ error: "Order not retrieved" }, 500);

  if (!data) return c.json({ error: "Order not found" }, 404);

  return c.json(data, 200);
});

orders.get("", customerInfoValidator, async (c) => {
  const db = getDB(c);

  const body = c.req.valid("json");

  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("phone", body.phone)
    .eq("customer_name", body.customer_name);

  const { data: orderItemsData, error: orderItemsError } = await db
    .from("order_items")
    .select("*")
    .eq("phone", body.phone)
    .eq("customer_name", body.customer_name);

  if (error) return c.json({ error: "Orders not retrieved" }, 500);

  if (!data) return c.json({ error: "No orders exist" }, 404);

  return c.json(data, 200);
});

orders.post("", orderInfoValidator, async (c) => {
  const db = getDB(c);
  const body = c.req.valid("json");

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
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
    p_address: body.address,
    p_total_price: totalPrice,
    p_items: orderItems,
  });

  if (rpcError) return c.json({ error: "Order placement failed" }, 500);

  // Minimum bandwidth success response
  return c.body(null, 201);

  /*
   * get all products mentioned in body
   * store them in products array one by one
   * mutliply the prices with quantity of individual products then add up all the answers from previous calculation
   * insert new row orders row and return the id for it with generated orderNumber, customer_name, phone, address, and total_price from the recent most calculation
   * insert new order_items rows for each product with newly made order_id and already fetched product_id with its price and the quantity from request body
   */
});

export default orders;
