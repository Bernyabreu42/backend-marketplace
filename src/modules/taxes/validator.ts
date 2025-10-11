import { z } from "zod";

export const taxTypeSchema = z.enum(["percentage", "fixed"]);

const baseTaxSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  type: taxTypeSchema,
  rate: z
    .number({ invalid_type_error: "La tasa debe ser un numero" })
    .positive("La tasa debe ser mayor a 0"),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "deleted"]).default("active"),
});

export const createTaxSchema = baseTaxSchema;

export const updateTaxSchema = baseTaxSchema.partial();

export const taxIdSchema = z.string().uuid({ message: "ID invalido" });

export const validateTax = (payload: unknown) => createTaxSchema.safeParse(payload);
export const validateTaxUpdate = (payload: unknown) => updateTaxSchema.safeParse(payload);
