import { z } from "zod";

const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "El nombre es obligatorio").max(120),
  slug: z.string().min(1).max(140).optional(), // si no viene, lo generamos del name
  description: z.string().max(400).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  order: z.number().int().min(0).max(999).optional(),
  isFeatured: z.boolean().optional(),
});

export const CreateCategorySchema = CategorySchema.omit({ id: true });
export const UpdateCategorySchema = CategorySchema.partial();

export const toSlug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
