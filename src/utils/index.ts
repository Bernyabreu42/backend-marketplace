import { deleteImage } from "../core/services/image-service";

export const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// search.ts
type SearchConfig = {
  contains?: string[];
  exact?: string[];
  number?: string[];
  boolean?: string[];
};

export const SEARCHABLE: Record<string, SearchConfig> = {
  product: {
    contains: ["name", "description", "sku"],
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
  review: {
    contains: ["comment"],
    number: ["rating"],
    exact: ["productId", "storeId", "userId"],
  },
  // user: { contains: ["name","email"], exact:["role"], boolean:["active"] }
};

function parseValue(key: string, raw: any, cfg: SearchConfig) {
  if (cfg.number?.includes(key))
    return Array.isArray(raw) ? raw.map(Number) : Number(raw);
  if (cfg.boolean?.includes(key)) return String(raw).toLowerCase() === "true";
  return raw;
}

const PRODUCT_STATUS_ALLOWED = new Set([
  "active",
  "inactive",
  "draft",
  "out_of_stock",
]);

const PRODUCT_STATUS_ALIASES: Record<string, string> = {
  published: "active",
  unpublished: "inactive",
};

const normalizeProductStatusValue = (
  value: unknown
): string | string[] | undefined => {
  const mapValue = (val: unknown): string | undefined => {
    if (typeof val !== "string") return undefined;
    const normalized = val.trim().toLowerCase();
    if (!normalized) return undefined;
    if (PRODUCT_STATUS_ALLOWED.has(normalized)) return normalized;
    return PRODUCT_STATUS_ALIASES[normalized];
  };

  if (Array.isArray(value)) {
    const normalized = value
      .map(mapValue)
      .filter((entry): entry is string => Boolean(entry));
    return normalized.length > 0 ? normalized : undefined;
  }

  return mapValue(value);
};

// Soporta: ?q=texto, ?name=..., ?status=..., ?price[gt]=100, ?status[in]=A,B
export function buildWhere(modelName: keyof typeof SEARCHABLE, query: any) {
  const cfg = SEARCHABLE[modelName] || {};
  const RESERVED = new Set(["page", "limit", "orderBy", "select", "include"]);

  const where: any = {};
  const OR: any[] = [];
  const AND: any[] = [];

  const applyProductCategoryFilter = (value: unknown, operator?: string) => {
    if (modelName !== "product") return;

    const values = (
      Array.isArray(value)
        ? value
        : String(value)
            .split(",")
            .map((entry) => entry.trim())
    ).filter((entry) => entry.length > 0);

    if (values.length === 0) return;

    if (operator === "neq") {
      AND.push({ categories: { none: { id: { in: values } } } });
      return;
    }

    if (values.length === 1 && operator !== "in") {
      AND.push({ categories: { some: { id: values[0] } } });
      return;
    }

    AND.push({ categories: { some: { id: { in: values } } } });
  };

  // búsqueda global
  const buildContainsAndClause = (field: string, raw: unknown) => {
    if (raw == null) return null;
    const original = String(raw);
    if (!original.trim()) return null;
    const normalized = normalizar(original);
    const variants = Array.from(new Set<string>([original, normalized]));
    if (variants.length === 1) {
      return { [field]: { contains: variants[0], mode: "insensitive" } };
    }
    return {
      OR: variants.map((value) => ({
        [field]: { contains: value, mode: "insensitive" },
      })),
    };
  };

  if (modelName !== "product" && query?.q && cfg.contains?.length) {
    for (const field of cfg.contains) {
      const clause = buildContainsAndClause(field, query.q);
      if (!clause) continue;
      if ("OR" in clause) {
        OR.push(...(clause as any).OR);
      } else {
        OR.push(clause);
      }
    }
  }

  for (const [rawKey, rawVal] of Object.entries(query || {})) {
    if (RESERVED.has(rawKey)) continue;
    if (rawVal == null || rawVal === "") continue;
    if (rawKey === "q") continue;

    // operadores: campo[gt], campo[lte], campo[in]
    const m = rawKey.match(/^(.+)\[(.+)\]$/);
    if (m) {
      const [, key, op] = m;
      if (modelName === "product" && key === "categoryId") {
        applyProductCategoryFilter(rawVal, op);
        continue;
      }
      const allowed = [
        ...(cfg.contains || []),
        ...(cfg.exact || []),
        ...(cfg.number || []),
        ...(cfg.boolean || []),
      ];
      if (!allowed.includes(key)) continue;

      const parsedValue = parseValue(key, rawVal, cfg);
      if (op === "in") {
        const arr = Array.isArray(parsedValue)
          ? parsedValue
          : String(parsedValue)
              .split(",")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0);

        let valuesForFilter: any;
        if (modelName === "product" && key === "status") {
          valuesForFilter = normalizeProductStatusValue(arr);
        } else {
          valuesForFilter = arr.map((x) => parseValue(key, x, cfg));
        }

        if (
          valuesForFilter === undefined ||
          (Array.isArray(valuesForFilter) && valuesForFilter.length === 0)
        ) {
          continue;
        }

        const valuesArray = Array.isArray(valuesForFilter)
          ? valuesForFilter
          : [valuesForFilter];

        AND.push({ [key]: { in: valuesArray } });
      } else if (["gt", "gte", "lt", "lte"].includes(op)) {
        AND.push({ [key]: { [op]: parsedValue } });
      } else if (op === "neq") {
        let valueForFilter: any = parsedValue;

        if (modelName === "product" && key === "status") {
          valueForFilter = normalizeProductStatusValue(parsedValue);
          if (
            valueForFilter === undefined ||
            (Array.isArray(valueForFilter) && valueForFilter.length === 0)
          ) {
            continue;
          }

          if (Array.isArray(valueForFilter)) {
            if (valueForFilter.length === 1) {
              AND.push({ [key]: { not: valueForFilter[0] } });
            } else {
              AND.push({ [key]: { notIn: valueForFilter } });
            }
            continue;
          }
        }

        AND.push({ [key]: { not: valueForFilter } });
      }
      continue;
    }

    // sin operador
    if (modelName === "product" && rawKey === "categoryId") {
      applyProductCategoryFilter(rawVal);
      continue;
    }
    if (cfg.exact?.includes(rawKey)) {
      let valueForFilter: any = parseValue(rawKey, rawVal, cfg);

      if (modelName === "product" && rawKey === "status") {
        valueForFilter = normalizeProductStatusValue(valueForFilter);
        if (
          valueForFilter === undefined ||
          (Array.isArray(valueForFilter) && valueForFilter.length === 0)
        ) {
          continue;
        }
      }

      AND.push(
        Array.isArray(valueForFilter)
          ? { [rawKey]: { in: valueForFilter } }
          : { [rawKey]: valueForFilter }
      );
    } else if (cfg.contains?.includes(rawKey)) {
      const clause = buildContainsAndClause(rawKey, rawVal);
      if (clause) {
        AND.push(clause);
      }
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
