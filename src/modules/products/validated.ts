// validated.ts
import { z } from "zod";

export const ProductStatusEnum = z.enum(["active", "inactive", "draft"]);

export const ProductSchema = z.object({
  id: z.string().uuid().optional(), // solo al editar
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  sku: z.string().optional(),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  priceFinal: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  stock: z.number().int().min(0, "El stock no puede ser negativo"),
  images: z.array(z.string()).default([]),
  categories: z
    .array(z.string().uuid("ID de categoría inválido"))
    .min(1, "Debe tener al menos una categoría"),
  status: ProductStatusEnum.default("active"),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  storeId: z.string().uuid({ message: "storeId inválido" }),

  // relación N:N con Tax -> enviamos ids de impuestos/descuentos aplicables
  taxes: z.array(z.string().uuid("taxId inválido")).default([]),

  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

// Útiles para controllers
export const CreateProductSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateProductSchema = ProductSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const IdSchema = z.string().uuid("ID inválido");

export type ProductInput = z.infer<typeof ProductSchema>;
