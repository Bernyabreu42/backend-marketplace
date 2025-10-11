import { z } from "zod";

export const CreateActionSchema = z.object({
  key: z
    .string({ required_error: "La accion necesita un identificador" })
    .trim()
    .min(2, "El identificador debe tener al menos 2 caracteres")
    .max(50, "El identificador no puede exceder 50 caracteres"),
  name: z
    .string({ required_error: "La accion necesita un nombre" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres"),
  description: z
    .string()
    .trim()
    .max(255, "La descripcion no puede exceder 255 caracteres")
    .optional(),
  defaultPoints: z
    .number({ invalid_type_error: "Los puntos deben ser un numero" })
    .int("Los puntos deben ser enteros")
    .min(0, "Los puntos por defecto no pueden ser negativos"),
  isActive: z.boolean().optional(),
});

export const UpdateActionSchema = CreateActionSchema.partial().extend({
  key: z.never().optional(),
});

export const AssignPointsSchema = z
  .object({
    userId: z.string().uuid("Usuario invalido"),
    actionKey: z
      .string({ invalid_type_error: "La accion debe ser texto" })
      .trim()
      .min(1, "La accion es requerida")
      .max(50)
      .optional(),
    points: z
      .number({ invalid_type_error: "Los puntos deben ser un numero" })
      .int("Los puntos deben ser enteros")
      .optional(),
    multiplier: z
      .number({ invalid_type_error: "El multiplicador debe ser un numero" })
      .nonnegative("El multiplicador no puede ser negativo")
      .optional(),
    referenceType: z
      .string({ invalid_type_error: "referenceType debe ser texto" })
      .trim()
      .min(2, "referenceType debe tener al menos 2 caracteres")
      .max(64, "referenceType no puede exceder 64 caracteres")
      .optional(),
    referenceId: z
      .string({ invalid_type_error: "referenceId debe ser texto" })
      .trim()
      .min(2, "referenceId debe tener al menos 2 caracteres")
      .max(64, "referenceId no puede exceder 64 caracteres")
      .optional(),
    description: z
      .string({ invalid_type_error: "La descripcion debe ser texto" })
      .trim()
      .max(255, "La descripcion no puede exceder 255 caracteres")
      .optional(),
    metadata: z.record(z.any()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.points == null && !data.actionKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes enviar puntos o una accion valida",
        path: ["points"],
      });
    }

    if ((data.referenceType && !data.referenceId) || (!data.referenceType && data.referenceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "referenceType y referenceId deben enviarse juntos",
        path: ["referenceType"],
      });
    }
  });

export const RedeemPointsSchema = z.object({
  userId: z.string().uuid("Usuario invalido").optional(),
  points: z
    .number({ invalid_type_error: "Los puntos deben ser un numero" })
    .int("Los puntos deben ser enteros")
    .positive("Debes indicar al menos 1 punto"),
  note: z
    .string({ invalid_type_error: "La nota debe ser texto" })
    .trim()
    .max(255, "La nota no puede exceder 255 caracteres")
    .optional(),
});

export const AccountQuerySchema = z.object({
  limit: z
    .coerce.number({ invalid_type_error: "limit debe ser un numero" })
    .int("limit debe ser entero")
    .min(1, "limit no puede ser menor que 1")
    .max(100, "limit no puede ser mayor a 100")
    .optional(),
});

export const IdParamSchema = z.object({
  id: z.string().uuid("Identificador invalido"),
});

export const UserIdParamSchema = z.object({
  userId: z.string().uuid("Usuario invalido"),
});

export const OrderIdParamSchema = z.object({
  orderId: z.string().uuid("Orden invalida"),
});
