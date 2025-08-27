import { Prisma } from "@prisma/client";
import { z } from "zod";

const jsonSchema = z.union([
  z.record(z.unknown()), // objeto
  z.array(z.unknown()), // array
  z.string(), // string
  z.number(),
  z.boolean(),
  z.null(),
]);

export const updateStoreStatusSchema = z.object({
  status: z.enum(["pending", "active", "inactive", "banned", "deleted"]),
});

export const updateStoreSchema = z.object({
  name: z.string().min(3).optional(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  website: z.string().url().optional(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  facebook: z.string().url().optional(),
  instagram: z.string().url().optional(),
  twitter: z.string().url().optional(),
  youtube: z.string().url().optional(),
  keywords: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  tax: z.record(z.unknown()).optional().nullable(),
  businessHours: z.record(z.unknown()).optional().nullable(),
});
