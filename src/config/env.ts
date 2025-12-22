import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  CLIENTS_URLS: z.string().optional(),
  CLIENT_URL: z.string().url().optional(), // This is the primary client URL
  CLIENT_URLS: z.array(z.string().url()).optional(), // This is an array of client URLs
  SELLER_ONBOARDING_URL: z.string().url().optional(),
  API_USERNAME: z.string().min(1, "API_USERNAME is required"),
  API_PASSWORD: z.string().min(1, "API_PASSWORD is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  EMAIL_TOKEN_SECRET: z.string().min(1, "EMAIL_TOKEN_SECRET is required"),
  RESET_SECRET: z.string().min(1, "RESET_SECRET is required"),
  MAIL_USER: z.string().email().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_SERVICE: z.string().optional(),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.coerce.number().int().positive().optional(),
  MAIL_SECURE: z.coerce.boolean().optional(),
  MAIL_IGNORE_TLS: z.coerce.boolean().optional(),
  MAIL_REQUIRE_TLS: z.coerce.boolean().optional(),
  MAIL_FROM: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
});

export const parseOrigins = (raw?: string): string[] => {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
        .map((value) => value.trim());
    }
    if (typeof parsed === "string") {
      const single = parsed.trim();
      return single ? [single] : [];
    }
  } catch {
    /* fall through */
  }

  return trimmed
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const flattened = result.error.flatten().fieldErrors;
  console.error("Invalid environment configuration:", flattened);
  throw new Error("Environment validation failed");
}

const envData = result.data;

const origins = parseOrigins(envData.CLIENTS_URLS);
const primaryClientUrl =
  envData.CLIENT_URL ?? origins[0] ?? "http://localhost:5173";
const clientOrigins = origins.length > 0 ? origins : [primaryClientUrl];

const resolveCookieDomain = (url: string): string | undefined => {
  try {
    const hostname = new URL(url).hostname;
    return hostname || undefined;
  } catch (error) {
    return undefined;
  }
};

const cookieDomain =
  envData.NODE_ENV === "production"
    ? resolveCookieDomain(primaryClientUrl)
    : undefined;

// console.log({
//   origins,
//   primaryClientUrl,
//   clientOrigins,
//   CLIENTS_URLS: envData.CLIENTS_URLS,
// });

export const env = {
  NODE_ENV: envData.NODE_ENV,
  isProd: envData.NODE_ENV === "production",
  PORT: envData.PORT,
  CLIENT_URL: primaryClientUrl,
  CLIENTS_URLS: clientOrigins,
  SELLER_ONBOARDING_URL: envData.SELLER_ONBOARDING_URL,
  CLIENT_ORIGINS: clientOrigins,
  API_USERNAME: envData.API_USERNAME,
  API_PASSWORD: envData.API_PASSWORD,
  JWT_SECRET: envData.JWT_SECRET,
  JWT_REFRESH_SECRET: envData.JWT_REFRESH_SECRET,
  EMAIL_TOKEN_SECRET: envData.EMAIL_TOKEN_SECRET,
  RESET_SECRET: envData.RESET_SECRET,
  COOKIE_DOMAIN: cookieDomain,
  MAIL_USER: envData.MAIL_USER,
  MAIL_PASS: envData.MAIL_PASS,
  MAIL_SERVICE: envData.MAIL_SERVICE,
  MAIL_HOST: envData.MAIL_HOST,
  MAIL_PORT: envData.MAIL_PORT,
  MAIL_SECURE: envData.MAIL_SECURE,
  MAIL_IGNORE_TLS: envData.MAIL_IGNORE_TLS,
  MAIL_REQUIRE_TLS: envData.MAIL_REQUIRE_TLS,
  MAIL_FROM: envData.MAIL_FROM,
  SEED_ADMIN_EMAIL: envData.SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD: envData.SEED_ADMIN_PASSWORD,
} as const;
