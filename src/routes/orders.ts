import { Hono } from "hono";
import { orderNumberValidator } from "../middleware/validators";
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

export default orders;
