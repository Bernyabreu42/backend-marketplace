import { Prisma } from "@prisma/client";

import prisma from "../../../database/prisma";
import { normalizar } from "../../../utils";

const MAX_SEARCH_MATCHES = 500;
const SEARCH_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX_ENTRIES = 200;
const ACCENT_SOURCE = "ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç";
const ACCENT_TARGET = "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc";

type SearchCacheEntry = {
  ids: string[] | null;
  expiresAt: number;
};

const searchCache = new Map<string, SearchCacheEntry>();

const buildCacheKey = (term: string, storeId?: string) =>
  `${storeId ?? "global"}::${term.toLowerCase()}`;

const getCachedSearch = (key: string) => {
  const cached = searchCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt > Date.now()) {
    return cached.ids;
  }

  searchCache.delete(key);
  return null;
};

const setCachedSearch = (key: string, ids: string[] | null) => {
  searchCache.set(key, { ids, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
  if (searchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) {
      searchCache.delete(oldestKey);
    }
  }
};

const escapeForLike = (value: string) =>
  value.replace(/[%_\\]/g, (char) => `\\${char}`);

const isUnaccentUnavailable = (error: unknown) => {
  if (!error) return false;
  const maybeObj = error as { code?: string; message?: unknown };
  const message = String(maybeObj?.message ?? "").toLowerCase();
  const asString = String(error).toLowerCase();
  return (
    maybeObj?.code === "42883" ||
    maybeObj?.code === "P2010" ||
    message.includes("42883") ||
    message.includes("unaccent") ||
    message.includes("function unaccent") ||
    asString.includes("42883") ||
    asString.includes("unaccent")
  );
};

let unaccentAvailable: boolean | null = null;

const runTranslateSearch = async (
  term: string,
  options: { storeId?: string }
) => {
  const { storeId } = options;
  const normalizedPattern = `%${escapeForLike(normalizar(term))}%`;

  const query = storeId
    ? Prisma.sql`
        SELECT "id"
        FROM "Product"
        WHERE (
          translate(lower(COALESCE("name", '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}) LIKE translate(${normalizedPattern}, ${ACCENT_SOURCE}, ${ACCENT_TARGET}) ESCAPE '\\'
          OR translate(lower(COALESCE("description", '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}) LIKE translate(${normalizedPattern}, ${ACCENT_SOURCE}, ${ACCENT_TARGET}) ESCAPE '\\'
          OR translate(lower(COALESCE("sku", '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}) LIKE translate(${normalizedPattern}, ${ACCENT_SOURCE}, ${ACCENT_TARGET}) ESCAPE '\\'
        )
        AND "storeId" = ${storeId}
        LIMIT ${MAX_SEARCH_MATCHES}
      `
    : Prisma.sql`
        SELECT "id"
        FROM "Product"
        WHERE (
          translate(lower(COALESCE("name", '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}) LIKE translate(${normalizedPattern}, ${ACCENT_SOURCE}, ${ACCENT_TARGET}) ESCAPE '\\'
          OR translate(lower(COALESCE("description", '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}) LIKE translate(${normalizedPattern}, ${ACCENT_SOURCE}, ${ACCENT_TARGET}) ESCAPE '\\'
          OR translate(lower(COALESCE("sku", '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}) LIKE translate(${normalizedPattern}, ${ACCENT_SOURCE}, ${ACCENT_TARGET}) ESCAPE '\\'
        )
        LIMIT ${MAX_SEARCH_MATCHES}
      `;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(query);
  return rows.map((row) => row.id);
};

export const buildFallbackSearchClause = (term: string) => {
  const normalized = normalizar(term);
  const variants = Array.from(new Set([term, normalized])).filter(Boolean);
  const fields = ["name", "description"] as const;
  const clauses: any[] = [];
  for (const variant of variants) {
    for (const field of fields) {
      clauses.push({ [field]: { contains: variant, mode: "insensitive" } });
    }
    clauses.push({ sku: { contains: variant, mode: "insensitive" } });
  }
  return clauses.length ? { OR: clauses } : undefined;
};

export const findProductIdsBySearchTerm = async (
  term: string,
  options: { storeId?: string } = {}
): Promise<string[] | null> => {
  const { storeId } = options;
  const cacheKey = buildCacheKey(term, storeId);
  const cached = getCachedSearch(cacheKey);
  if (cached !== null) {
    return cached;
  }

  let ids: string[] | null = null;

  if (unaccentAvailable !== false) {
    const pattern = `%${escapeForLike(term)}%`;

    const query = storeId
      ? Prisma.sql`
          SELECT "id"
          FROM "Product"
          WHERE (
            unaccent("name") ILIKE unaccent(${pattern}) ESCAPE '\\'
            OR unaccent("description") ILIKE unaccent(${pattern}) ESCAPE '\\'
            OR unaccent(COALESCE("sku", '')) ILIKE unaccent(${pattern}) ESCAPE '\\'
          )
          AND "storeId" = ${storeId}
          LIMIT ${MAX_SEARCH_MATCHES}
        `
      : Prisma.sql`
          SELECT "id"
          FROM "Product"
          WHERE (
            unaccent("name") ILIKE unaccent(${pattern}) ESCAPE '\\'
            OR unaccent("description") ILIKE unaccent(${pattern}) ESCAPE '\\'
            OR unaccent(COALESCE("sku", '')) ILIKE unaccent(${pattern}) ESCAPE '\\'
          )
          LIMIT ${MAX_SEARCH_MATCHES}
        `;

    try {
      const rows = await prisma.$queryRaw<Array<{ id: string }>>(query);
      if (unaccentAvailable === null) {
        unaccentAvailable = true;
      }
      ids = rows.map((row) => row.id);
    } catch (error) {
      if (isUnaccentUnavailable(error)) {
        unaccentAvailable = false;
      } else {
        throw error;
      }
    }
  }

  if (unaccentAvailable === false && ids === null) {
    ids = await runTranslateSearch(term, options);
  }

  setCachedSearch(cacheKey, ids);
  return ids;
};

export const resolvePaginationParams = (query: any) => {
  const rawPage = Array.isArray(query?.page) ? query.page[0] : query?.page;
  const rawLimit = Array.isArray(query?.limit) ? query.limit[0] : query?.limit;

  const pageNumber = Number(rawPage);
  const limitNumber = Number(rawLimit);

  const page =
    Number.isFinite(pageNumber) && pageNumber > 0 ? Math.trunc(pageNumber) : 1;
  const limit =
    Number.isFinite(limitNumber) && limitNumber > 0
      ? Math.trunc(limitNumber)
      : 10;

  return { page, limit };
};

export const extractSearchTerm = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.length ? String(value[0]).trim() : "";
  }
  if (typeof value === "string") return value.trim();
  return "";
};
