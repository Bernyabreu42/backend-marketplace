import { z } from "zod";

export const ORDER_STATUS_VALUES = [
  "pending",
  "processing",
  "paid",
  "shipped",
  "completed",
  "cancelled",
] as const;

const OrderItemSchema = z.object({
  productId: z.string().uuid("Producto invalido"),
  quantity: z
    .number({ invalid_type_error: "La cantidad debe ser un numero" })
    .int("La cantidad debe ser un entero")
    .positive("La cantidad debe ser mayor a cero"),
});

export const CreateOrderSchema = z.object({
  storeId: z.string().uuid("Tienda invalida"),
  userId: z.string().uuid("Usuario invalido").optional(),
  items: z.array(OrderItemSchema).min(1, "Debes incluir al menos un producto"),
  promotionCode: z.string().optional(),
  shippingAddress: z.any().optional(),
  shippingMethod: z.string().optional(),
});

export const OrderQuerySchema = z.object({
  status: z
    .string({ invalid_type_error: "El estado debe ser texto" })
    .trim()
    .min(1, "El estado no puede estar vacio")
    .max(32)
    .optional(),
  storeId: z.string().uuid("Tienda invalida").optional(),
  userId: z.string().uuid("Usuario invalido").optional(),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES, {
    errorMap: () => ({ message: "Estado de orden invalido" }),
  }),
});

export const IdSchema = z.object({
  id: z.string().uuid("Orden invalida"),
});
