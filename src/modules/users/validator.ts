import { z } from "zod";

import { RolesEnum } from "../../core/enums";

const roleSchema = z.nativeEnum(RolesEnum).default(RolesEnum.BUYER);

export const createUserSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8),
  role: roleSchema,
  username: z
    .string()
    .min(3)
    .max(50)
    .optional()
    .transform((value) => value?.trim().toLowerCase()),
  phone: z.string().optional().transform((value) => value?.trim()),
  firstName: z.string().min(1).max(50).optional().transform((value) => value?.trim()),
  lastName: z.string().min(1).max(50).optional().transform((value) => value?.trim()),
  displayName: z.string().max(100).optional().transform((value) => value?.trim()),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

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

export function buildDisplayName(data: CreateUserInput) {
  if (data.displayName && data.displayName.length > 0) return data.displayName;
  if (data.firstName || data.lastName) {
    return [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
  }
  if (data.username) return data.username;
  return data.email.split("@")[0];
}

export const bodySchema = z.object({
  profileImage: z.string().min(1),
});
