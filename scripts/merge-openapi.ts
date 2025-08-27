import fs from "node:fs";
const files = [
  "src/openapi/base.json",
  "src/openapi/auth.json",
  "src/openapi/user.json",
  "src/openapi/upload.json",
  // agrega más módulos aquí...
];

const deepMerge = (a: any, b: any) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(a?.[k] ?? {}, v);
    } else if (Array.isArray(v) && Array.isArray(a?.[k])) {
      // merge de tags únicos por nombre
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
  // toma info/servers/tags si no existen
  if (!result.info && doc.info) result.info = doc.info;
  if (!result.servers && doc.servers) result.servers = doc.servers;
  result.paths = { ...result.paths, ...(doc.paths ?? {}) };
  if (doc.components)
    result.components = deepMerge(result.components, doc.components);
  if (doc.tags)
    result.tags = deepMerge({ tags: result.tags }, { tags: doc.tags }).tags;
}
fs.writeFileSync("src/openapi.json", JSON.stringify(result, null, 2));
console.log("✅ Generado src/openapi.json");
