import { Hono } from "hono";
import { getDB } from "../../utils/db";
import {
  productIdValidator,
  productInfoValidator,
  updateProductInfoValidator,
} from "../middleware/validators";
import { contextStorage } from "hono/context-storage";

const products = new Hono();

// 1. GET ALL PRODUCTS
products.get("", async (c) => {
  const db = getDB(c);

  const { data, error } = await db
    .from("products")
    .select()
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase Error:", error);
    // Sanitize DB error string to avoid leaking schema/PostgREST internals
    return c.json({ error: "Failed to retrieve products" }, 500);
  }

  return c.json({ data }, 200);
});

// 2. GET SINGLE PRODUCT
products.get("/:id", productIdValidator, async (c) => {
  const { id } = c.req.valid("param");
  const db = getDB(c);

  const { data, error } = await db
    .from("products")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Supabase Error:", error);
    // Sanitize DB error string
    return c.json({ error: "Failed to retrieve product details" }, 500);
  }

  if (!data) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json({ data }, 200);
});

products.post("", productInfoValidator, async (c) => {
  const db = getDB(c);
  const body = c.req.valid("json");

  const { error } = await db.from("products").insert(body);

  if (error) return c.json({ error: error.message }, 500);

  return c.json(200);
});

products.patch(
  "/:id",
  productIdValidator,
  updateProductInfoValidator,
  async (c) => {
    const db = getDB(c);
    const id = c.req.valid("param");
    const body = c.req.valid("json");
    console.log(body);
    const { error } = await db.from("products").update(body).eq("id", id);

    if (error) return c.json({ error: error.message }, 500);

    return c.json(200);
  },
);

export default products;
