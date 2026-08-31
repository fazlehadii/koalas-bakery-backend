import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const uuidSchema = z.object({
  id: z.uuid({ version: "v4" }),
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
  is_active: z.boolean(),
});

const orderSchema = z.object({
  products: z
    .array(
      z.object({
        productId: z.uuid({ version: "v4" }),
        size: z.string().nullish(),
        quantity: z.int().positive(),
      }),
    )
    .min(1)
    .refine(
      (items) => {
        const uniqueKeys = items.map((i) => `${i.productId}-${i.size ?? ""}`);
        return new Set(uniqueKeys).size === items.length;
      },
      {
        message: "Duplicate product and size. Use 'quantity' instead",
      },
    ),
  customer_name: z.string().min(3),
  phone: z.string().regex(/^\+923\d{9}$/, "Invalid phone number"),
  email: z.email("Enter a valid email address"),
  address: z.string().min(5, "Enter a valid address"),
});

const orderLookupSchema = z.object({
  email: z.email("Enter a valid email address"),
  phone: z.string().regex(/^\+923\d{9}$/, "Invalid phone number"),
  order_id: z.string().min(3, "Order ID is required"),
});

const orderStatusSchema = z.object({
  id: z.uuid({ version: "v4" }),
  status: z.string().max(30),
});

const customerInfoSchema = z.object({
  customer_name: z.string().min(3),
  phone: z.string().regex(/^\+923\d{9}$/, "Invalid phone number"),
});

const errorHook = (result, c) => {
  if (!result.success) {
    const issue =
      result.error.issues[0]?.message || "Invalid request parameters";
    return c.json({ error: issue }, 400);
  }
};

export const uuidValidator = zValidator("param", uuidSchema, errorHook);

export const orderStatusValidator = zValidator(
  "param",
  orderStatusSchema,
  errorHook,
);

export const productInfoValidator = zValidator(
  "json",
  productSchema,
  errorHook,
);

export const customerInfoValidator = zValidator(
  "query",
  customerInfoSchema,
  errorHook,
);

export const orderLookupValidator = zValidator(
  "json",
  orderLookupSchema,
  errorHook,
);

export const orderInfoValidator = zValidator("json", orderSchema, errorHook);

export const updateProductInfoValidator = zValidator(
  "json",
  productSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  }),
  errorHook,
);
