# CommerceHub Backend Project Guide

## 1. Project Overview
- Purpose: multi-tenant e-commerce backend powering authentication, catalog, orders, loyalty, and admin workflows for the CommerceHub marketplace.
- Key technologies: Bun runtime, TypeScript + Express, Prisma ORM against PostgreSQL, Zod validation, JWT authentication, Multer + Sharp for file uploads, Nodemailer for email, Scalar for interactive API docs.
- High-level architecture: `src/app.ts` wires core middleware (JSON parsing, cookies, CORS, static uploads, Scalar docs), applies a global `apiKeyGuard` (Basic auth), and mounts feature routers under `/api/*`. Controllers delegate to Prisma-powered services/utilities, and shared concerns live under `src/core` and `src/utils`. `src/server.ts` boots the Express app after ensuring Prisma connectivity and handles graceful shutdown.
- Editorial content: the blog module (`src/modules/blog`) stores posts in the Prisma `BlogPost` model, exposing public listing/detail endpoints and admin-protected CRUD to publish marketplace news.
- Store promotion: the `Store` model now tracks spotlighted sellers via `isFeatured` and `featuredUntil`, letting us surface curated storefronts today and plug in paid placement or subscription logic later.
- Shipping management: `src/modules/shipping` centralizes CRUD for store-defined shipping methods, including public listing by store, seller-protected create/update/delete, and the new `GET /api/shipping/:id` detail endpoint now documented in OpenAPI.
- Customer feedback: `src/modules/reviews` permite a los compradores calificar productos (1-5), listar reseñas por producto/tienda y administrar comentarios con controles de duplicados, permisos y visibilidad pública.
- Order pricing snapshots: cada `OrderItem` almacena `unitPrice`, `unitPriceFinal`, `lineSubtotal` y `lineDiscount`, mientras que la orden registra `totalDiscountAmount`, `promotionCodeUsed` y `priceAdjustments` con detalle de descuentos/promos aplicados.
- Featured stores: `GET /api/stores/featured` devuelve tiendas destacadas activas; si no hay, se devuelven las mejor valoradas y con más ventas (incluye métricas como `ratingAverage`, `ratingsCount`, `salesCount`).


## 2. Getting Started
### Prerequisites
- Bun ^1.1 (confirm locally with `bun --version`).
- Node.js 18+ (needed for some tooling like `bunx`).
- PostgreSQL 14+ reachable via `DATABASE_URL`.
- Git and a shell capable of running the provided scripts.
- Optional: SMTP credentials for transactional emails and an S3-compatible store if migrating away from local uploads (verify with infra).

### Installation
1. Clone the repository and switch into the backend folder.
2. Install dependencies: `bun install`.
3. Ensure the `uploads/` directory remains writable for local image storage (created by default).

### Environment configuration
- Copy the existing `.env` (or create one based on `README.md` guidance) and update secrets: `API_USERNAME`, `API_PASSWORD`, JWT/refresh/email/reset secrets, `DATABASE_URL`, SMTP credentials. The project validates these at startup via `src/config/env.ts`; missing or invalid values stop the process with a detailed error map.
- Configure outgoing email: set `MAIL_USER`/`MAIL_PASS` and optionally `MAIL_SERVICE` (defaults to Gmail) or explicit SMTP settings (`MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_IGNORE_TLS`, `MAIL_REQUIRE_TLS`, `MAIL_FROM`). Gmail requires an app-specific password; regular account passwords are rejected.
- Configure allowed frontend origins with either `CLIENT_URL` or `CLIENTS_URLS` (comma-separated or JSON array). When unsure, coordinate with frontend owners (**needs verification** if multiple production origins differ).

### Running the application
- Apply migrations and seed dev data: `bun run db:dev` (equivalent to `bunx prisma migrate dev` + seed script).
- Start the watcher: `bun run dev` (executes `src/server.ts` with Bun's watch mode).
- Access API explorer at `http://localhost:4000/docs`; authenticated requests must include an `Authorization: Basic base64(API_USERNAME:API_PASSWORD)` header because of the global `apiKeyGuard`.

### Running tests
- Execute the Bun-powered test suite: `bun test`.
- To run a single file: `bun test tests/modules/products.controller.test.ts`.
- Tests expect a local PostgreSQL instance; see `tests/config/env.test.ts` for overrides if an ephemeral database is available.

## 3. Project Structure
| Path | Description |
| --- | --- |
| `src/app.ts` | Express configuration, middleware stack, route registration, Scalar docs, global guards. |
| `src/server.ts` | Process bootstrap, health check route, Prisma lifecycle management. |
| `src/config/` | Runtime configuration helpers (`env.ts`, cookie settings). |
| `src/core/` | Shared enums, response helpers (`ApiResponse`, `ApiPaginatedResponse`), services (email, loyalty, image), templating, and TS types. |
| `src/database/prisma.ts` | Singleton Prisma Client instance with dev-mode hot reload safeties. |
| `src/middlewares/` | Cross-cutting express middleware (API key guard, JWT-based `routeProtector`, Zod validator, multipart uploads). |
| `src/modules/` | Feature modules (auth, users, stores, products, orders, loyalty, etc.) typically exposing `*.routes.ts`, `*.controller.ts`, optional services/validators. |
| `src/modules/blog/` | Blog feature (controllers, routes, validators) serving public posts and admin CRUD backed by Prisma `BlogPost`. |
| `src/modules/stores/` | Store onboarding, CRUD, media uploads, featured metadata (`isFeatured`, `featuredUntil`), and the featured listing endpoint (`GET /api/stores/featured`). |
| `src/modules/shipping/` | Shipping methods per store: public listing, detail retrieval, and seller-guarded create/update/delete operations with soft-delete safeguards. |
| `src/modules/reviews/` | Product reviews: list by product/store, buyer-only creation, owner/admin moderation, with seed data for quick demos. |
| `src/utils/` | Utilities such as JWT helpers, pagination, error extraction, template rendering. |
| `src/openapi/` & `src/openapi.json` | Source OpenAPI fragments plus the merged artifact served at runtime (`scripts/merge-openapi.ts`). |
| `prisma/` | Prisma schema, migrations, and `seed.ts` with deterministic bootstrap data. |
| `tests/` | Bun test suites mirroring runtime structure (config, core, middlewares, modules, utils). |
| `docs/` & `.docs/` | High-level documentation (`docs/project_documentation.md`) and this operational guide for tooling context providers. |
| `uploads/` | Local filesystem target for uploaded assets (developer machines only; replace in production if needed). |

## 4. Development Workflow
- **Coding conventions**: Use TypeScript strict mode. Keep controllers thin and funnel complex logic into services/utilities. Always wrap HTTP responses with `ApiResponse`/`ApiPaginatedResponse` for consistency. Validate request payloads via Zod schemas and `zodValidator` middleware before hitting controllers.
- **Featured stores**: When curating recommendations, filter active, non-deleted stores and honor the new Prisma fields (`Store.isFeatured`, `Store.featuredUntil`). Seed data and selectors already expose both values so downstream services can implement business rules without extra queries.
- **Shipping methods**: Consumers can fetch all methods via `GET /api/shipping/store/:storeId` or a single method with `GET /api/shipping/:id`. Sellers must authenticate (via `routeProtector`) to create, update, or soft-delete methods, so remember to propagate `req.user.storeId` in integrations.
- **Reviews**: `GET /api/reviews/product/{productId}` y `/api/reviews/store/{storeId}` son públicos. Solo los buyers autenticados pueden crear reseñas (se valida duplicado por usuario/producto) y buyers o admins pueden editarlas/eliminarlas.
- **Authentication & authorization**: Remember that every `/api/*` request must pass the Basic auth guard *and* any route-specific `routeProtector` (which refreshes tokens automatically when a valid refresh token cookie is present). Role-based access can be specified via `routeProtector(["admin", ...])`.
- **Testing approach**: Unit/integration tests live under `tests/` and run with Bun's native runner. Tests often mock Prisma calls or hit in-memory server instances; keep new tests colocated by feature (e.g., `tests/modules/<feature>.test.ts`).
- **Build & deployment**: The production entry point is `bun run start`, which deploys migrations (`prisma migrate deploy`), seeds via `prisma db seed`, and starts the server. Ensure migrations are generated (`bunx prisma migrate dev --name <change>`) and committed alongside schema changes.
- **Contribution checklist**: Create a feature branch, update Prisma schema/migrations, add or update OpenAPI fragments + rerun `bun run openapi:build`, write tests, run `bun test`, and verify `bun run dev` boots without env validation errors. Open a PR with context about any new env vars. Add module-level docs (e.g., `modules/<feature>/guide.md`) if complexity grows.

## 5. Key Concepts
- **ApiResponse & ApiPaginatedResponse** (`src/core/responses`): canonical response envelopes; always return these helpers to keep client contracts stable.
- **API key guard** (`src/middlewares/apiKeyGuard.ts`): per-request Basic auth using `API_USERNAME`/`API_PASSWORD`. Even internal integrations must include this header.
- **JWT session model**: Access tokens are short-lived JWTs; refresh tokens are persisted in the `Session` table. `routeProtector` rotates refresh tokens automatically to prevent replay attacks.
- **Loyalty hook** (`src/modules/orders/order-loyalty-hook.ts`): patches Prisma's `order.create` to queue loyalty point awards. Swap executors with `setLoyaltyAwardExecutor` in tests.
- **Domain highlights**: Stores own products, taxes, shipping methods; promotions/discounts manage campaign rules; loyalty points accrue on orders; uploads store images locally but can be abstracted.
- **Blog content**: `BlogPost` supports `draft`, `published`, and `archived` statuses, slug uniqueness, and optional scheduling via `publishedAt`. Seed data creates two published posts owned by the admin user.
- **Validation & querying utilities**: `paginate`, `buildWhere`, and `andWhere` standardize filtering/pagination; Zod schemas under each module's `validator.ts` enforce request shape.

## 6. Common Tasks
1. **Run database migrations in development**
   - `bunx prisma migrate dev --name <migration>`
   - `bun run db:dev` to apply + seed.
2. **Reset the database**
   - `bun run db:reset` (drops data, reapplies migrations, reruns seed).
3. **Generate Prisma client after schema edits**
   - `bunx prisma generate`.
4. **Update OpenAPI documentation**
   - Edit fragments in `src/openapi/*.json`.
   - Run `bun run openapi:build` to merge into `src/openapi.json`.
   - Smoke-test `/docs` to confirm Scalar renders the changes.
5. **Add a new feature module**
   - Create `src/modules/<feature>/` with controller, routes, validators, optional service.
   - Register router in `src/app.ts` under `/api/<feature>`.
   - Add tests in `tests/modules/<feature>.test.ts`.
   - Document new endpoints in OpenAPI and update seeds/migrations as needed.
6. **Send transactional emails locally**
   - Populate `MAIL_USER`/`MAIL_PASS` with a test SMTP account (e.g., Mailtrap).
   - Confirm templates under `src/core/templates/` cover new email flows (**needs verification** for campaign-specific templates).
7. **Consultar ordenes de la tienda como vendedor**
   - `GET /api/orders/store` requiere rol seller; devuelve unicamente las ordenes de la tienda asociada al usuario y acepta filtro opcional `status`.
8. **Publicar contenido en el blog**
   - Solo admin y soporte pueden usar `POST /api/blog` para crear; el slug se deriva del titulo y se ajusta automaticamente si ya existe. `status` acepta `draft`, `published`, `archived`; cuando publicas sin `publishedAt`, el API usa la fecha actual.
   - `PATCH /api/blog/:id` permite actualizar extracto, contenido, tags y programar publicaciones futuras (establece `publishedAt`). `DELETE /api/blog/:id` aplica borrado logico. Los listados publicos estan en `GET /api/blog` y `GET /api/blog/{slug}`.
   - El seed (`prisma/seed.ts`) incluye dos entradas publicadas de ejemplo; puedes regenerarlas con `bun run db:dev` si necesitas datos de prueba.

## 7. Marketplace Operations Notes

### 7.1 Seller Account Offboarding
- Self-service deletions (`DELETE /users/delete/:id`) now transition the seller to `UserStatus.pending_review` while preserving audit metadata (`deletedAt`, `deletedBy`).  
- All active sessions are revoked immediately, ensuring the seller loses access across devices.  
- Stores owned by the seller drop to `StatusStore.pending`, lose any featured placement (`isFeatured = false`, `featuredUntil = null`), and remain hidden until ops reviews the case.  
- Workflow: ops reviews the seller/store combo, either reinstating both (and resetting status to `active`) or proceeding with a full takedown (permanently disabling store + catalog).

### 7.2 Product Visibility Rules
- Public catalog endpoints (`GET /api/products`, `/api/products/:id`, `/api/products/store/:storeId`, `/api/products/:id/related`) solo muestran inventario de tiendas `status = "active"` y `isDeleted = false`. Propietarios de la tienda y roles `admin/support` reciben una excepción: mientras estén autenticados pueden consultar su catálogo aun si la tienda está pendiente, lo que permite revisar existencias antes de la aprobación.  
- Requests for inventory tied to pending/disabled stores respond with a 404-style `"Producto no disponible"` payload to keep clients from displaying unavailable listings.  
- No cache purge is required after reactivation; visibility flips automatically once the store returns to the active state.
- `/api/stores/featured` ahora incluye `topProducts` (máximo 3). Se calcula primero con los más vendidos; si no hay ventas registradas, se rellenan con los últimos productos creados para que siempre haya contenido destacado.

### 7.3 Multi-Store Promotions & Cart Pricing
- Discounts/promotions remain scoped per store via `storeId`. When a buyer mixes products from multiple sellers, split the cart by store before running pricing rules.  
- For each store partition:  
  - Apply product-level discounts, coupon codes, shipping perks, and cart thresholds that belong to that store.  
  - Generate a per-store adjustment summary and persist it (e.g., append to `Order.priceAdjustments` for reconciliation).  
- After per-store calculations, aggregate totals to present a unified checkout summary. Clearly label each adjustment (“Descuento Tienda Alpha”, “Promoción Tienda Beta”) in customer receipts and admin dashboards.  
- Reserve “global” coupons for explicitly flagged cases; apply them after per-store passes to avoid leaking one seller’s budget into another’s order.
- Buyer dashboards now receive a `sellerUpgrade` payload (via `verifyMe`) whenever the user role is `buyer`. This includes headline, copy, and CTA URL (defaults to `${CLIENT_URL}/seller/onboarding` or `SELLER_ONBOARDING_URL` if set) so the frontend can surface a “Convertirme en vendedor” action strategically. When a seller has already started onboarding, the payload flips to a pending-review message instead of the CTA.

## 8. Troubleshooting
- **"Invalid environment configuration" on startup**: Check `src/config/env.ts` for required keys; the console logs a map of missing/invalid fields. Ensure `.env` strings are quoted and free of stray spaces.
- **`P1001`/database connection errors**: Verify PostgreSQL is reachable at `DATABASE_URL`, the server is running, and your IP/SSL settings align. Running `bunx prisma db pull` can confirm connectivity.
- **401 responses despite valid JWTs**: The global `apiKeyGuard` still requires Basic auth. Confirm the client sends `Authorization: Basic ...` alongside cookies.
- **OpenAPI page returns 500**: Regenerate the merged spec with `bun run openapi:build` and ensure every fragment contains valid JSON.
- **Image upload failures**: Confirm the `uploads/` directory exists and Bun has permission to write. On Windows, unblock Sharp native binaries if SmartScreen intervenes.
- **Prisma client out of date**: After editing `schema.prisma`, rerun `bunx prisma generate` and restart the dev server to avoid missing model methods.

## 9. References
- `README.md` in the project root for expanded context and .env template.
- Prisma documentation: https://www.prisma.io/docs
- Bun documentation: https://bun.sh/docs
- Express documentation: https://expressjs.com/
- Zod validation guide: https://zod.dev/
- Scalar API Reference docs: https://github.com/scalar/scalar
- Nodemailer usage: https://nodemailer.com/about/

---
This guide is auto-discoverable by compatible assistants. Feel free to add additional `guide.md` or `rules.md` files within module directories for feature-specific playbooks.








