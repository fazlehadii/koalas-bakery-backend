import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const productIdSchema = z.object({
  id: z.uuid({ version: "v4" }),
});

const orderNumberSchema = z.object({
  order_number: z
    .string()
    .regex(/^KB-\d{4}-[A-Z0-9]{4}$/, "Wrong order number"),
});

const productSchema = z.object({
  name: z.string().min(3),
  type: z.string().min(3),
  description: z.string().min(30),
  image_url: z.url(),
  price: z.number().positive(),
  stock: z.int().nonnegative(),
  max_purchasable_limit: z.int().positive(),
  size: z.array(z.string()).optional(),
});

const errorHook = (result, c) => {
  if (!result.success) {
    const issue =
      result.error.issues[0]?.message || "Invalid request parameters";
    return c.json({ error: issue }, 400);
  }
};

export const productIdValidator = zValidator(
  "param",
  productIdSchema,
  errorHook,
);

export const orderNumberValidator = zValidator(
  "param",
  orderNumberSchema,
  errorHook,
);

export const productInfoValidator = zValidator(
  "json",
  productSchema,
  errorHook,
);

export const updateProductInfoValidator = zValidator(
  "json",
  productSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  }),
  errorHook,
);
