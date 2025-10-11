import { z } from "zod";

export const productStatusSchema = z.enum(["active", "inactive", "draft"]);

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().min(1, "La descripcion es obligatoria"),
  sku: z.string().optional(),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  stock: z.number().int().min(0, "El stock no puede ser negativo"),
  images: z.array(z.string()).default([]),
  categories: z
    .array(z.string().uuid("ID de categoria invalido"))
    .min(1, "Debe tener al menos una categoria"),
  status: productStatusSchema.default("active"),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  storeId: z.string().uuid({ message: "storeId invalido" }),
  taxes: z.array(z.string().uuid("taxId invalido")).default([]),
  discountId: z.string().uuid("ID de descuento inválido").nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createProductSchema = productSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProductSchema = productSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const IdSchema = z.string().uuid("ID invalido");

export type ProductInput = z.infer<typeof productSchema>;

export const ProductStatusEnum = productStatusSchema;
export const ProductSchema = productSchema;
export const CreateProductSchema = createProductSchema;
export const UpdateProductSchema = updateProductSchema;
