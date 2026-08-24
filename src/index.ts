import { Hono } from "hono";
import products from "./routes/products";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled Error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.get("/", (c) => {
  return c.text("niggeronies");
});

app.route("/api/products", products);

export default app;
