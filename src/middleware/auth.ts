import { createMiddleware } from "hono/factory";
import type { Env } from "../types/types";

export const adminAuth = createMiddleware<Env>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  const expected = c.env.BAKERY_ADMIN_SECRET;

  if (!expected || authorization !== `Bearer ${expected}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
