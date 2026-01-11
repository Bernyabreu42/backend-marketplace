import { LegalDocumentType } from "@prisma/client";
import { z } from "zod";

const preprocessEmptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === "") return undefined;
    return value;
  }, schema.optional().nullable());

const isValidUrlOrUploadPath = (value: string) => {
  if (value.startsWith("/uploads/")) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const urlOrPath = z
  .string()
  .min(1)
  .refine(isValidUrlOrUploadPath, { message: "URL invalida" });

const optionalUrlOrPath = preprocessEmptyToUndefined(urlOrPath);

const hexColorBase = z
  .string()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "Color invalido");

const optionalHexColor = preprocessEmptyToUndefined(hexColorBase);

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const iso = new Date(trimmed);
    if (!Number.isNaN(iso.getTime())) return iso;
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day)
      );
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return undefined;
};

const optionalDate = z
  .union([z.date(), z.string(), z.number(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = toDate(value as string | number);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fecha invalida",
      });
      return z.NEVER;
    }
    return parsed;
  });

export const IdParamSchema = z.object({
  id: z.string().uuid(),
});

export const PromoModalCreateSchema = z.object({
  title: z.string().max(120).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  imageUrl: urlOrPath,
  altText: z.string().max(160).optional().nullable(),
  targetUrl: optionalUrlOrPath,
  kind: z.enum(["promo", "info", "cookies", "alert"]).optional(),
  isActive: z.boolean().optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  priority: z.number().int().min(0).max(100).optional(),
});

export const PromoModalUpdateSchema = PromoModalCreateSchema.partial();

export const AnnouncementCreateSchema = z.object({
  message: z.string().min(3).max(180),
  targetUrl: optionalUrlOrPath,
  backgroundColor: optionalHexColor,
  textColor: optionalHexColor,
  isActive: z.boolean().optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
});

export const AnnouncementUpdateSchema = AnnouncementCreateSchema.partial();

export const CarouselSlideCreateSchema = z.object({
  title: z.string().max(120).optional().nullable(),
  subtitle: z.string().max(200).optional().nullable(),
  imageUrl: urlOrPath,
  altText: z.string().max(160).optional().nullable(),
  targetUrl: optionalUrlOrPath,
  order: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
});

export const CarouselSlideUpdateSchema = CarouselSlideCreateSchema.partial();

const socialLinksSchema = z
  .record(z.string().url({ message: "URL invalida" }))
  .optional()
  .nullable();

const addressSchema = z
  .object({
    line1: z.string().optional().nullable(),
    line2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
  })
  .optional()
  .nullable();

export const CompanyProfileUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  tagline: z.string().max(200).optional().nullable(),
  about: z.string().optional().nullable(),
  mission: z.string().optional().nullable(),
  vision: z.string().optional().nullable(),
  values: z.array(z.string().max(100)).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  whatsapp: z.string().max(30).optional().nullable(),
  address: addressSchema,
  mapUrl: optionalUrlOrPath,
  logoUrl: optionalUrlOrPath,
  faviconUrl: optionalUrlOrPath,
  supportHours: z.string().max(120).optional().nullable(),
  socialLinks: socialLinksSchema,
});

export const LegalDocumentCreateSchema = z.object({
  type: z.nativeEnum(LegalDocumentType),
  title: z.string().min(3).max(200),
  content: z.string().min(20),
  version: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
  publishedAt: optionalDate,
});

export const LegalDocumentUpdateSchema = LegalDocumentCreateSchema.partial();

export const LegalQuerySchema = z.object({
  type: z.nativeEnum(LegalDocumentType),
});
