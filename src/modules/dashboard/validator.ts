import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const RangeBase = z.object({
  rangeStart: z
    .string()
    .regex(dateRegex, "rangeStart debe tener formato YYYY-MM-DD")
    .optional(),
  rangeEnd: z
    .string()
    .regex(dateRegex, "rangeEnd debe tener formato YYYY-MM-DD")
    .optional(),
  days: z
    .coerce
    .number({ invalid_type_error: "days debe ser un numero" })
    .int("days debe ser entero")
    .min(1, "days debe ser mayor a 0")
    .max(180, "El rango maximo permitido es 180 dias")
    .optional(),
});

export const OverviewQuerySchema = RangeBase;
export const RangeQuerySchema = RangeBase;

export const TopProductsQuerySchema = RangeBase.extend({
  limit: z
    .coerce
    .number({ invalid_type_error: "limit debe ser un numero" })
    .int("limit debe ser entero")
    .min(1, "limit debe ser mayor a 0")
    .max(20, "limit maximo es 20")
    .optional(),
});
