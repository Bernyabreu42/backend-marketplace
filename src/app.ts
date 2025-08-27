import express from "express";
import userRoutes from "./modules/users/user.routes";
import authRoutes from "./modules/auth/auth.routes";
import uploadRoutes from "./modules/upload/upload.routes";
import productsRoutes from "./modules/products/products.routes";
import categoryRoutes from "./modules/category/category.routes";
import taxesRoutes from "./modules/taxes/taxes.routes";
import storesRoutes from "./modules/stores/stores.routes";
import { ApiResponse } from "./core/responses/ApiResponse";
import { apiKeyGuard } from "./middlewares/apiKeyGuard ";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "node:fs";
import { apiReference } from "@scalar/express-api-reference";

const app = express();

// 1) core middlewares
app.use(express.json());
app.use(cookieParser());

// 2) CORS (Soporta JSON o CSV)
const allowedOrigins: string[] = (() => {
  const raw = process.env.CLIENTS_URLS?.trim();
  if (!raw) return ["http://localhost:5173"];
  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw.split(",").map((s) => s.trim());
  }
})();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

// 3) estáticos
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// 4) RUTAS PÚBLICAS: spec + docs (van ANTES del guard)
app.get("/openapi.json", (_req, res) => {
  const specPath = path.join(process.cwd(), "src", "openapi.json"); // ajusta ruta
  res.type("application/json").send(fs.readFileSync(specPath, "utf-8"));
});

// UI de Scalar en /api (usa tu spec de arriba)
app.use("/docs", apiReference({ url: "/openapi.json", theme: "purple" }));

// 5) Guard (UNA sola vez, después de docs)
app.use(apiKeyGuard);

// 6) Rutas protegidas
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload-image", uploadRoutes);
app.use("/api/stores", storesRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/taxes", taxesRoutes);

// 7) Not found
app.get("*", (req, res) => {
  res.status(404).send(ApiResponse.error({ message: "Not found" }));
});

export default app;
