import { z } from 'zod';

// Replicating the enum from schema.prisma to avoid direct dependency
export const ShippingStatusEnum = z.enum([
  'active',
  'inactive',
]);

const ShippingMethodSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "El nombre es obligatorio").max(120),
  description: z.string().max(500).optional().nullable(),
  cost: z.number().min(0, "El costo no puede ser negativo"),
  status: ShippingStatusEnum.optional(),
  storeId: z.string().uuid("El ID de la tienda no es válido"),
});

// Schema for creating a new shipping method.
// storeId will be extracted from the authenticated user, not the request body.
export const CreateShippingMethodSchema = ShippingMethodSchema.omit({ id: true, storeId: true });

// Schema for updating an existing shipping method. All fields are optional.
// storeId is omitted as the method will be identified by its ID, and ownership is verified separately.
export const UpdateShippingMethodSchema = ShippingMethodSchema.omit({ storeId: true }).partial();
