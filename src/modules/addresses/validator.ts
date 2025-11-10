import { z } from "zod";

export const AddressSchema = z
  .object({
    country: z.string().min(1, "El país es requerido"),
    state: z.string().min(1, "El estado/provincia es requerido"),
    city: z.string().min(1, "La ciudad es requerida"),
    postalCode: z.string().min(1, "El código postal es requerido"),
    street: z.string().min(1, "La dirección es requerida"),
    apartment: z.string().optional(),
    note: z.string().optional(),
    notes: z.string().optional(),
    phone: z.string().optional(),
    recipientName: z.string().optional(),
    contactName: z.string().optional(),
  })
  .passthrough();

export const CreateAddressSchema = AddressSchema.merge(
  z.object({
    label: z
      .string()
      .trim()
      .min(1, "La etiqueta no puede estar vacía")
      .max(100, "La etiqueta es demasiado larga")
      .optional(),
    isDefault: z.boolean().optional(),
    address: AddressSchema.optional(),
  })
);

export const UpdateAddressSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "La etiqueta no puede estar vacía")
      .max(100, "La etiqueta es demasiado larga")
      .optional(),
    address: AddressSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .merge(AddressSchema.partial())
  .superRefine((data, ctx) => {
    const hasTopLevelAddress = Object.keys(data).some((key) =>
      ["country", "state", "city", "postalCode", "street", "apartment", "reference", "note", "notes", "phone", "recipientName", "contactName"].includes(
        key
      )
    );

    if (
      typeof data.label === "undefined" &&
      typeof data.address === "undefined" &&
      typeof data.isDefault === "undefined" &&
      !hasTopLevelAddress
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debes enviar al menos un campo para actualizar",
      });
    }
  });
