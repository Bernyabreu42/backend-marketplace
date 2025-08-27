// src/modules/stores/validated.ts
import { z } from "zod";
import { StatusStore } from "@prisma/client";

// Helpers
const toNull = (s?: string | null) =>
  typeof s === "string" ? (s.trim() === "" ? null : s.trim()) : null;

const urlOrNull = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine(
    (v) => v === undefined || /^https?:\/\/|^\/uploads\//i.test(v),
    "Debe ser URL http(s) o ruta local /uploads/..."
  );

const phoneRegex = /^[+()\d\s.-]{6,20}$/;

// ---- Business hours (opcional, simple) ----
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:mm 00-23
export const businessDaySchema = z.object({
  day: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  open: z.string().regex(timeRegex, "Formato HH:mm"),
  close: z.string().regex(timeRegex, "Formato HH:mm"),
  closed: z.boolean().optional(),
});
export type BusinessDay = z.infer<typeof businessDaySchema>;

// ---- Create ----
export const createStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    tagline: z.string().trim().max(140).optional(),
    description: z.string().trim().min(1).max(2000),

    email: z.string().email().optional(),
    phone: z.string().regex(phoneRegex, "Teléfono inválido").optional(),
    address: z.string().trim().max(200).optional(),

    website: urlOrNull,
    facebook: urlOrNull,
    instagram: urlOrNull,
    twitter: urlOrNull,
    youtube: urlOrNull,

    logo: urlOrNull,
    banner: urlOrNull,
    profileImage: urlOrNull,
    bannerImage: urlOrNull,

    keywords: z.string().trim().max(300).optional(),
    metaTitle: z.string().trim().max(70).optional(),
    metaDesc: z.string().trim().max(160).optional(),

    businessHours: z.array(businessDaySchema).optional(),

    // lo define el sistema (dueño autenticado) o admin
    ownerId: z.string().uuid().optional(),

    // opcional, por defecto "pending"
    status: z.nativeEnum(StatusStore).default(StatusStore.pending).optional(),
  })
  .transform((v) => ({
    ...v,
    name: v.name.trim(),
    tagline: toNull(v.tagline),
    description: v.description.trim(),
    email: v.email?.trim().toLowerCase(),
    phone: v.phone,
    address: toNull(v.address),

    website: v.website,
    facebook: v.facebook,
    instagram: v.instagram,
    twitter: v.twitter,
    youtube: v.youtube,

    logo: v.logo,
    banner: v.banner,
    profileImage: v.profileImage,
    bannerImage: v.bannerImage,

    keywords: toNull(v.keywords),
    metaTitle: toNull(v.metaTitle),
    metaDesc: toNull(v.metaDesc),

    businessHours: v.businessHours,
    ownerId: v.ownerId,
    status: v.status ?? StatusStore.pending,
  }));

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

// ---- Update (parcial) ----
export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    tagline: z.string().trim().max(140).optional(),
    description: z.string().trim().min(1).max(2000).optional(),

    email: z.string().email().optional(),
    phone: z.string().regex(phoneRegex, "Teléfono inválido").optional(),
    address: z.string().trim().max(200).optional(),

    website: urlOrNull,
    facebook: urlOrNull,
    instagram: urlOrNull,
    twitter: urlOrNull,
    youtube: urlOrNull,

    logo: urlOrNull,
    banner: urlOrNull,
    profileImage: urlOrNull,
    bannerImage: urlOrNull,

    keywords: z.string().trim().max(300).optional(),
    metaTitle: z.string().trim().max(70).optional(),
    metaDesc: z.string().trim().max(160).optional(),

    businessHours: z.array(businessDaySchema).optional(),

    // Admin-only típicamente
    status: z.nativeEnum(StatusStore).optional(),
  })
  .transform((v) => ({
    ...v,
    name: v.name?.trim(),
    tagline: v.tagline === undefined ? undefined : toNull(v.tagline),
    description: v.description?.trim(),
    email: v.email?.trim().toLowerCase(),
    phone: v.phone,
    address: v.address === undefined ? undefined : toNull(v.address),

    website: v.website,
    facebook: v.facebook,
    instagram: v.instagram,
    twitter: v.twitter,
    youtube: v.youtube,

    logo: v.logo,
    banner: v.banner,
    profileImage: v.profileImage,
    bannerImage: v.bannerImage,

    keywords: v.keywords === undefined ? undefined : toNull(v.keywords),
    metaTitle: v.metaTitle === undefined ? undefined : toNull(v.metaTitle),
    metaDesc: v.metaDesc === undefined ? undefined : toNull(v.metaDesc),

    businessHours: v.businessHours,
    status: v.status,
  }));

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

// ---- Query (listado/paginación/búsqueda) ----
export const listStoreQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).default(10).optional(),
  search: z.string().trim().optional(), // nombre|email|phone
  status: z.nativeEnum(StatusStore).optional(),
  sortBy: z
    .enum(["createdAt", "name", "status"])
    .default("createdAt")
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc").optional(),
});
export type ListStoreQuery = z.infer<typeof listStoreQuerySchema>;

// ---- Cambiar estado (útil si haces endpoint dedicado) ----
export const changeStatusSchema = z.object({
  status: z.nativeEnum(StatusStore),
  reason: z.string().trim().max(300).optional(), // si banean, etc.
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

// ---- Helpers para usar en controllers ----
export function validateCreateStore(input: unknown) {
  const r = createStoreSchema.safeParse(input);
  return r.success
    ? { success: true as const, data: r.data }
    : { success: false as const, errors: r.error.flatten().fieldErrors };
}

export function validateUpdateStore(input: unknown) {
  const r = updateStoreSchema.safeParse(input);
  return r.success
    ? { success: true as const, data: r.data }
    : { success: false as const, errors: r.error.flatten().fieldErrors };
}

export function validateListStoreQuery(input: unknown) {
  const r = listStoreQuerySchema.safeParse(input);
  return r.success
    ? { success: true as const, data: r.data }
    : { success: false as const, errors: r.error.flatten().fieldErrors };
}

export function validateChangeStatus(input: unknown) {
  const r = changeStatusSchema.safeParse(input);
  return r.success
    ? { success: true as const, data: r.data }
    : { success: false as const, errors: r.error.flatten().fieldErrors };
}
