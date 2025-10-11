import { z } from "zod";

const ratingSchema = z
  .coerce.number({
    required_error: "La calificación es obligatoria",
    invalid_type_error: "La calificación debe ser un número",
  })
  .int("La calificación debe ser un número entero")
  .min(1, "La calificación mínima es 1")
  .max(5, "La calificación máxima es 5");

const optionalComment = z
  .string()
  .trim()
  .max(1000, "El comentario no puede superar los 1000 caracteres")
  .optional()
  .transform((value) =>
    value === undefined || value.length === 0 ? undefined : value
  );

export const CreateReviewSchema = z.object({
  productId: z
    .string({
      required_error: "El producto es obligatorio",
      invalid_type_error: "El producto debe ser un UUID",
    })
    .uuid("ID de producto inválido"),
  rating: ratingSchema,
  comment: optionalComment,
});

export const UpdateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    comment: optionalComment,
  })
  .refine(
    (value) => value.rating !== undefined || value.comment !== undefined,
    "Debe proporcionar al menos un campo para actualizar"
  );

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
export type UpdateReviewInput = z.infer<typeof UpdateReviewSchema>;
