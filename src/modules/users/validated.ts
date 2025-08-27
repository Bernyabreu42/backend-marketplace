import { z } from "zod";
import { RolesEnum } from "../../core/enums";

// Esquema de creación de usuario (solo valida formato y normaliza)
const RoleSchema = z.nativeEnum(RolesEnum).default(RolesEnum.BUYER);
// (Si no usas TS enum, usa: z.enum(["admin","seller","buyer","support"]).default("buyer"))

export const createUserSchema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8),
  role: RoleSchema, // ← ya tiene default; no lo toques en transform
  username: z
    .string()
    .min(3)
    .max(50)
    .optional()
    .transform((s) => s?.trim().toLowerCase()),
  phone: z
    .string()
    .optional()
    .transform((s) => s?.trim()),
  firstName: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .transform((s) => s?.trim()),
  lastName: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .transform((s) => s?.trim()),
  displayName: z
    .string()
    .max(100)
    .optional()
    .transform((s) => s?.trim()),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// Helper para usar en controllers
export function validateCreateUser(input: unknown) {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  return { success: true as const, data: parsed.data };
}

// Construye un displayName razonable si no llega
export function buildDisplayName(data: CreateUserInput) {
  if (data.displayName && data.displayName.length) return data.displayName;
  if (data.firstName || data.lastName) {
    return [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
  }
  if (data.username) return data.username;
  return data.email.split("@")[0]; // fallback
}

export const bodySchema = z.object({
  // acepta URL absoluta o ruta local /uploads/...
  profileImage: z.string().min(1),
});
