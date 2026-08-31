import { Hono } from "hono";
import { getDB } from "../../utils/db";
import { adminAuth } from "../middleware/auth";
import {
  uuidValidator,
  productInfoValidator,
  updateProductInfoValidator,
} from "../middleware/validators";
import { notifyProductRevalidation } from "../lib/revalidate";

const products = new Hono();

products.use("*", async (c, next) => {
  if (["POST", "PATCH", "DELETE"].includes(c.req.method)) {
    return adminAuth(c, next);
  }
  await next();
});

products.get("", async (c) => {
  const cacheKey = new Request(c.req.url, { method: "GET" });

  const cache = caches.default;
  let response = await cache.match(cacheKey);

  if (!response) {
    const db = getDB(c);

    // Field projection: Exclude heavy fields like 'description' for list views.
    // Pagination limit: Cap at 50 to prevent bandwidth exhaustion.
    const { data, error } = await db
      .from("products")
      .select("id, name, type, price, image_url, stock, max_purchasable_limit")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Supabase Error:", error);
      return c.json({ error: "Failed to retrieve products" }, 500);
    }

    response = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "max-age=86400",
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
});

products.get("/:id", uuidValidator, async (c) => {
  const cacheKey = new Request(c.req.url, { method: "GET" });

  const cache = caches.default;

  let response = await cache.match(cacheKey);

  if (!response) {
    const { id } = c.req.valid("param");
    const db = getDB(c);

    // Select everything since it's the detail view
    const { data, error } = await db
      .from("products")
      .select("description, stock, max_purchasable_limit, size")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Supabase Error:", error);
      return c.json({ error: "Failed to retrieve product details" }, 500);
    }

    if (!data) {
      return c.json({ error: "Product not found" }, 404);
    }

    response = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "max-age=86400",
      },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
});

products.post("", productInfoValidator, async (c) => {
  const db = getDB(c);
  const body = c.req.valid("json");

  const { data, error } = await db.from("products").insert(body).select().single();

  if (error) {
    console.error("Supabase Error:", error);
    if (error.code === "23505") {
      return c.json({ error: "Product names must be unique" }, 409);
    }
    // Sanitized: Never leak DB internals on writes
    return c.json({ error: "Failed to create product" }, 500);
  }

  const cache = caches.default;

  c.executionCtx.waitUntil(
    cache.delete(
      new Request(`${new URL(c.req.url).origin}/api/products`, {
        method: "GET",
      }),
    ),
  );
  notifyProductRevalidation(c.env, c.executionCtx.waitUntil.bind(c.executionCtx));

  return c.json(data, 201);
});

products.patch("/:id", uuidValidator, updateProductInfoValidator, async (c) => {
  const db = getDB(c);
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const { error } = await db.from("products").update(body).eq("id", id);

  if (error) {
    console.error("Supabase Error:", error);
    if (error.code === "23505") {
      return c.json({ error: "Product names must be unique" }, 409);
    }
    return c.json({ error: "Failed to update product" }, 500);
  }

  const genericFields = ["name", "type", "price", "image_url"];
  const nonGenericFields = [
    "description",
    "stock",
    "max_purchasable_limit",
    "size",
  ];

  const genericFieldsFound = Object.keys(body).some((key) =>
    genericFields.includes(key),
  );
  const nonGenericFieldsFound = Object.keys(body).some((key) =>
    nonGenericFields.includes(key),
  );

  const cache = caches.default;

  if (genericFieldsFound) {
    c.executionCtx.waitUntil(
      cache.delete(
        new Request(`${new URL(c.req.url).origin}/api/products`, {
          method: "GET",
        }),
      ),
    );
  }

  if (nonGenericFieldsFound) {
    c.executionCtx.waitUntil(
      cache.delete(new Request(c.req.url, { method: "GET" })),
    );
  }

  notifyProductRevalidation(c.env, c.executionCtx.waitUntil.bind(c.executionCtx));

  // 204 No Content sends 0 bytes. Lowest possible bandwidth.
  return c.body(null, 204);
});

products.delete("/:id", uuidValidator, async (c) => {
  const db = getDB(c);
  const { id } = c.req.valid("param");

  const { error } = await db
    .from("products")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    console.error("Supabase Error:", error);
    return c.json({ error: "Failed to delete product" }, 500);
  }

  const cache = caches.default;

  c.executionCtx.waitUntil(
    Promise.all([
      cache.delete(new Request(c.req.url, { method: "GET" })), // /products/:id
      cache.delete(
        new Request(`${new URL(c.req.url).origin}/api/products`, {
          method: "GET",
        }),
      ), // /products
    ]),
  );
  notifyProductRevalidation(c.env, c.executionCtx.waitUntil.bind(c.executionCtx));

  return c.body(null, 204);
});

export default products;
