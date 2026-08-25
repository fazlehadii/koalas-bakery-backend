import { Hono } from "hono";
import {
  orderInfoValidator,
  orderNumberValidator,
} from "../middleware/validators";
import { getDB } from "../../utils/db";

const orders = new Hono();

orders.get("/:order_number", orderNumberValidator, async (c) => {
  const db = getDB(c);

  const { order_number } = c.req.valid("param");

  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("order_number", order_number)
    .maybeSingle();

  if (error) return c.json({ error: "Order not retrieved" }, 500);

  if (!data) return c.json({ error: "Order not found" }, 404);

  return c.json(data, 200);
});

orders.get("", async (c) => {
  const db = getDB(c);

  const { data, error } = await db.from("orders").select("*");

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
  // Generates 4 random uppercase alphanumeric characters
  const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderNumber = `KB-${mm}${dd}-${randomCode}`; // KB-0825-X7K2

  // const productIds = body.products.map((product) => product.productId);
  const uniqueProductIds = Array.from(
    new Set(body.products.map((p) => p.productId)),
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
    const dbProduct = dbProductMap.get(bodyProduct.productId);

    if (
      (dbProduct.size && !dbProduct.size.includes(bodyProduct.size)) ||
      bodyProduct.quantity > dbProduct.stock ||
      bodyProduct.quantity > dbProduct.max_purchasable_limit
    ) {
      return c.json({ error: "Product quantity too much" }, 400);
    }

    totalPrice += dbProduct.price * bodyProduct.quantity;
  }

  const { data: orderData, error: orderError } = await db
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_name: body.customer_name,
      phone: body.phone,
      address: body.address,
      total_price: totalPrice,
    })
    .select("id")
    .maybeSingle();

  if (orderError || !orderData)
    return c.json({ error: "Order placement failed" }, 500);

  const orderItems = body.products.map((item) => {
    const dbProduct = dbProductMap.get(item.productId)!;
    return {
      order_id: orderData.id,
      product_id: item.productId,
      size: item.size ?? null,
      quantity: item.quantity,
      price_at_time: dbProduct.price,
    };
  });

  const { error: orderItemsError } = await db
    .from("order_items")
    .insert(orderItems);

  if (orderItemsError) {
    await db.from("orders").delete().eq("id", orderData.id);
    return c.json({ error: "Order placement failed" }, 500);
  }

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
