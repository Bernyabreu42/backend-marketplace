import fs from "node:fs";
const files = [
  "src/openapi/base.json",
  "src/openapi/blog.json",
  "src/openapi/auth.json",
  "src/openapi/user.json",
  "src/openapi/upload.json",
  "src/openapi/products.json",
  "src/openapi/favorites.json",
  "src/openapi/addresses.json",
  "src/openapi/reviews.json",
  "src/openapi/category.json",
  "src/openapi/stores.json",
  "src/openapi/taxes.json",
  "src/openapi/discounts.json",
  "src/openapi/shipping.json",
  "src/openapi/promotions.json",
  "src/openapi/loyalty.json",
  "src/openapi/orders.json",
  "src/openapi/dashboard.json",
  "src/openapi/site-content.json",
];

const deepMerge = (a: any, b: any) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(a?.[k] ?? {}, v);
    } else if (Array.isArray(v) && Array.isArray(a?.[k])) {
      if (k === "tags") {
        const byName = new Map<string, any>(a[k].map((t: any) => [t.name, t]));
        v.forEach((t: any) =>
          byName.set(t.name, { ...byName.get(t.name), ...t })
        );
        out[k] = Array.from(byName.values());
      } else out[k] = [...a[k], ...v];
    } else {
      out[k] = v;
    }
  }
  return out;
};

let result: any = {
  openapi: "3.0.3",
  paths: {},
  components: { schemas: {}, securitySchemes: {} },
  tags: [],
};
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!result.info && doc.info) result.info = doc.info;
  if (!result.servers && doc.servers) result.servers = doc.servers;
  result.paths = { ...result.paths, ...(doc.paths ?? {}) };
  if (doc.components)
    result.components = deepMerge(result.components, doc.components);
  if (doc.tags)
    result.tags = deepMerge({ tags: result.tags }, { tags: doc.tags }).tags;
}
fs.writeFileSync("src/openapi.json", JSON.stringify(result, null, 2));
console.log("📘 Generado src/openapi.json");
