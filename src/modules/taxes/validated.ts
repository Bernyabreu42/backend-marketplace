// validated.ts
import { z } from "zod";

export const TaxTypeEnum = z.enum(["percentage", "fixed", "discount"]);

export const TaxSchema = z.object({
  id: z.string().uuid().optional(), // opcional si es para crear
  name: z.string().min(1, "El nombre es obligatorio"),
  type: TaxTypeEnum,
  rate: z
    .number({ invalid_type_error: "La tasa debe ser un número" })
    .positive("La tasa debe ser mayor a 0"),
  description: z.string().optional(),
  status: z.enum(["active", "inactive", "deleted"]).default("active"),
});

// Validación adicional condicional si necesitas refinar por tipo:
export const ValidatedTaxes = TaxSchema.superRefine((data, ctx) => {
  if (data.type === "percentage" && data.rate > 100) {
    ctx.addIssue({
      path: ["rate"],
      code: z.ZodIssueCode.custom,
      message: "El porcentaje no puede ser mayor a 100%",
    });
  }

  if (data.type === "fixed" && data.rate < 1) {
    ctx.addIssue({
      path: ["rate"],
      code: z.ZodIssueCode.custom,
      message: "El monto fijo debe ser al menos 1",
    });
  }
});

export type TaxInput = z.infer<typeof ValidatedTaxes>;
