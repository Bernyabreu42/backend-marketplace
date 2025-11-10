import fs from "node:fs";
import path from "path";
import { apiReference } from "@scalar/express-api-reference";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { ApiResponse } from "./core/responses/ApiResponse";
import { apiKeyGuard } from "./middlewares/apiKeyGuard";
import authRoutes from "./modules/auth/auth.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import categoryRoutes from "./modules/category/category.routes";
import discountsRoutes from "./modules/discounts/discounts.routes";
import productsRoutes from "./modules/products/products.routes";
import promotionsRoutes from "./modules/promotions/promotions.routes";
import storesRoutes from "./modules/stores/stores.routes";
import taxesRoutes from "./modules/taxes/taxes.routes";
import uploadRoutes from "./modules/upload/upload.routes";
import userRoutes from "./modules/users/user.routes";
import loyaltyRoutes from "./modules/loyalty/loyalty.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import shippingRoutes from "./modules/shipping/shipping.routes";
import blogRoutes from "./modules/blog/blog.routes";
import reviewsRoutes from "./modules/reviews/reviews.routes";
import favoritesRoutes from "./modules/favorites/favorites.routes";
import addressesRoutes from "./modules/addresses/addresses.routes";
const app = express();

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = env.CLIENT_ORIGINS;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const specPath = path.join(process.cwd(), "src", "openapi.json");
let cachedOpenApi: string | null = null;

const getOpenApiSpec = () => {
  if (cachedOpenApi) return cachedOpenApi;
  cachedOpenApi = fs.readFileSync(specPath, "utf-8");
  return cachedOpenApi;
};

app.get("/openapi.json", (_req, res) => {
  try {
    res.type("application/json").send(getOpenApiSpec());
  } catch (error) {
    res.status(500).send("OpenAPI spec not available");
  }
});

app.use("/docs", apiReference({ url: "/openapi.json", theme: "purple" }));

app.use(apiKeyGuard);

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload-image", uploadRoutes);
app.use("/api/stores", storesRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/discounts", discountsRoutes);
app.use("/api/promotions", promotionsRoutes);
app.use("/api/taxes", taxesRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/addresses", addressesRoutes);

app.get("*", (_req, res) => {
  res.status(404).send(ApiResponse.error({ message: "Not found" }));
});

export default app;
