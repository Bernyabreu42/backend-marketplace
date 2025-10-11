import { z } from "zod";

export const promotionTypeSchema = z.enum(["automatic", "coupon"]);

const promotionDetailsSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().optional(),
  type: promotionTypeSchema,
  value: z
    .number({ invalid_type_error: "El valor debe ser numerico" })
    .positive("El valor debe ser mayor a 0")
    .optional(),
  code: z.string().min(1, "El codigo es obligatorio").optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  status: z.enum(["active", "inactive", "deleted"]).default("active"),
});

const withPromotionRules = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((data, ctx) => {
    const startsAt = (data as any).startsAt as Date | undefined;
    const endsAt = (data as any).endsAt as Date | undefined;
    const type = (data as any).type as "automatic" | "coupon" | undefined;
    const code = (data as any).code as string | undefined;

    if (startsAt && endsAt && endsAt < startsAt) {
      ctx.addIssue({
        path: ["endsAt"],
        code: z.ZodIssueCode.custom,
        message: "La fecha de fin debe ser posterior a la de inicio",
      });
    }

    if (type === "coupon" && (!code || code.trim() === "")) {
      ctx.addIssue({
        path: ["code"],
        code: z.ZodIssueCode.custom,
        message: "El codigo es obligatorio para promociones con cupon",
      });
    }
  });

export const createPromotionSchema = withPromotionRules(promotionDetailsSchema);
export const updatePromotionSchema = withPromotionRules(promotionDetailsSchema.partial());
export const promotionIdSchema = z.string().uuid({ message: "ID invalido" });

export const validatePromotion = (payload: unknown) =>
  createPromotionSchema.safeParse(payload);

export const validatePromotionUpdate = (payload: unknown) =>
  updatePromotionSchema.safeParse(payload);
