import { z } from "zod";

export const discountTypeSchema = z.enum(["percentage", "fixed"]);

const baseDiscountSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  type: discountTypeSchema,
  value: z
    .number({ invalid_type_error: "El valor debe ser numerico" })
    .positive("El valor debe ser mayor a 0"),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "deleted"]).default("active"),
});

export const createDiscountSchema = baseDiscountSchema;
export const updateDiscountSchema = baseDiscountSchema.partial();
export const discountIdSchema = z.string().uuid({ message: "ID invalido" });

export const validateDiscount = (payload: unknown) =>
  createDiscountSchema.safeParse(payload);

export const validateDiscountUpdate = (payload: unknown) =>
  updateDiscountSchema.safeParse(payload);
