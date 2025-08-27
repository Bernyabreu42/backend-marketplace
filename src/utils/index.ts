import { deleteImage } from "../core/services/image-service";

// search.ts
type SearchConfig = {
  contains?: string[];
  exact?: string[];
  number?: string[];
  boolean?: string[];
};

export const SEARCHABLE: Record<string, SearchConfig> = {
  product: {
    contains: ["name", "slug", "description"],
    exact: ["status", "categoryId"],
    number: ["price", "stock"],
    boolean: ["active"],
  },
  category: {
    contains: ["name", "slug"],
  },
  store: {
    contains: ["name"],
  },
  // user: { contains: ["name","email"], exact:["role"], boolean:["active"] }
};

function parseValue(key: string, raw: any, cfg: SearchConfig) {
  if (cfg.number?.includes(key))
    return Array.isArray(raw) ? raw.map(Number) : Number(raw);
  if (cfg.boolean?.includes(key)) return String(raw).toLowerCase() === "true";
  return raw;
}

// Soporta: ?q=texto, ?name=..., ?status=..., ?price[gt]=100, ?status[in]=A,B
export function buildWhere(modelName: keyof typeof SEARCHABLE, query: any) {
  const cfg = SEARCHABLE[modelName] || {};
  const RESERVED = new Set(["page", "limit", "orderBy", "select", "include"]);

  const where: any = {};
  const OR: any[] = [];
  const AND: any[] = [];

  // búsqueda global
  if (query?.q && cfg.contains?.length) {
    for (const f of cfg.contains) {
      OR.push({ [f]: { contains: String(query.q), mode: "insensitive" } });
    }
  }

  for (const [rawKey, rawVal] of Object.entries(query || {})) {
    if (RESERVED.has(rawKey)) continue;
    if (rawVal == null || rawVal === "") continue;

    // operadores: campo[gt], campo[lte], campo[in]
    const m = rawKey.match(/^(.+)\[(.+)\]$/);
    if (m) {
      const [, key, op] = m;
      const allowed = [
        ...(cfg.contains || []),
        ...(cfg.exact || []),
        ...(cfg.number || []),
        ...(cfg.boolean || []),
      ];
      if (!allowed.includes(key)) continue;

      const v = parseValue(key, rawVal, cfg);
      if (op === "in") {
        const arr = Array.isArray(v) ? v : String(v).split(",");
        AND.push({ [key]: { in: arr.map((x) => parseValue(key, x, cfg)) } });
      } else if (["gt", "gte", "lt", "lte"].includes(op)) {
        AND.push({ [key]: { [op]: parseValue(key, v, cfg) } });
      } else if (op === "neq") {
        AND.push({ [key]: { not: parseValue(key, v, cfg) } });
      }
      continue;
    }

    // sin operador
    if (cfg.exact?.includes(rawKey)) {
      const v = parseValue(rawKey, rawVal, cfg);
      AND.push(Array.isArray(v) ? { [rawKey]: { in: v } } : { [rawKey]: v });
    } else if (cfg.contains?.includes(rawKey)) {
      AND.push({ [rawKey]: { contains: String(rawVal), mode: "insensitive" } });
    }
  }

  if (OR.length) where.OR = OR;
  if (AND.length) where.AND = AND;

  return where;
}

export function andWhere<T extends object>(
  ...clauses: Array<T | undefined | null | false>
): T | undefined {
  const parts = clauses.filter(Boolean) as T[];
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return { AND: parts } as unknown as T;
}

export const isLocalUpload = (p: string) =>
  p.startsWith("/uploads/") || p.includes("/uploads/");

export async function safeDelete(pathOrUrl: string) {
  try {
    // evita borrar si no es local (e.g. S3) o si no corresponde
    if (!isLocalUpload(pathOrUrl)) return;
    await deleteImage(pathOrUrl);
  } catch {
    // logueá pero NO rompas la respuesta
    console.warn("No se pudo borrar imagen previa:", pathOrUrl);
  }
}

export const stripUndef = <T extends Record<string, any>>(obj: T) =>
  Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
