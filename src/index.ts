import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import products from "./routes/products";
import orders from "./routes/orders";

const app = new Hono();

// 1. CORS Middleware (Applied to all /api routes)
app.use(
  "/api/*",
  cors({
    origin: (origin, c) =>
      [c.env.FRONTEND_URL, "http://localhost:3000"].includes(origin)
        ? origin
        : "",
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// 2. Global Error Handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled Error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// 3. Global 404 Handler (Standardized JSON response)
app.notFound((c) => {
  return c.json({ error: "Route Not Found" }, 404);
});

// 4. Routes
app.get("/", (c) => c.text("niggeronies"));

app.route("/api/products", products);
app.route("/api/orders", orders);

export default app;
