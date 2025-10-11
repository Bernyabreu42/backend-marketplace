# CommerceHub - Backend API

## 1. Overview

CommerceHub is a robust, feature-rich backend for e-commerce marketplace applications. It is built with a modern, modular architecture using TypeScript, Express.js, and Prisma. This document provides a comprehensive guide for developers and AI models to understand, use, and extend the project.

### 1.1. Key Features

-   **Modular Architecture**: Code is organized by feature (auth, products, users, etc.) for high cohesion and low coupling.
-   **Authentication & Authorization**: Secure JWT-based authentication with Access and Refresh Token rotation. Role-based access control (RBAC) with `admin`, `seller`, `buyer`, and `support` roles.
-   **E-commerce Core**: Full support for Stores, Products, Categories, Orders, Taxes, Discounts, and Promotions.
-   **Shipping Management**: Allows sellers to manage shipping methods for their stores, with endpoints for creating, updating, deleting, and listing methods per store.
-   **User & Store Management**: Endpoints for managing users and seller stores.
-   **Customer Loyalty Program**: A complete system for earning and redeeming loyalty points.
-   **Database**: Powered by PostgreSQL and the Prisma ORM, with a well-defined schema and soft-delete capabilities.
-   **API Documentation**: Automatically generated and interactive API documentation via Scalar.
-   **Email Service**: Integrated `nodemailer` service for sending transactional emails (e.g., account verification, password reset).
-   **File Uploads**: Handles image uploads for avatars, banners, and products with image processing capabilities.

## 2. Technology Stack

-   **Runtime**: [Bun](https://bun.sh/)
-   **Framework**: [Express.js](https://expressjs.com/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Database ORM**: [Prisma](https://www.prisma.io/)
-   **Database**: [PostgreSQL](https://www.postgresql.org/)
-   **Validation**: [Zod](https://zod.dev/)
-   **Authentication**: [JSON Web Tokens (JWT)](https://jwt.io/)
-   **API Documentation**: [Scalar](https://github.com/scalar/scalar)
-   **Email**: [Nodemailer](https://nodemailer.com/)
-   **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/)
-   **File Uploads**: [Multer](https://github.com/expressjs/multer)

## 3. Project Structure

The project follows a modular structure that separates concerns and promotes scalability.

```
.
├── prisma/
│   ├── schema.prisma       # Database schema definition
│   └── seed.ts             # Database seed script
├── src/
│   ├── app.ts              # Express app configuration (middleware, routes)
│   ├── server.ts           # Server entry point (starts server, DB connection)
│   ├── config/             # Project configuration (env variables, cookies)
│   ├── core/               # Core shared components (entities, enums, services)
│   ├── database/           # Prisma client instantiation
│   ├── middlewares/        # Custom Express middleware (auth, validation)
│   ├── modules/            # Core application modules (features)
│   │   ├── auth/           # Authentication module
│   │   │   ├── auth.routes.ts
│   │   │   └── auth.controller.ts
│   │   └── ...             # Other modules (products, orders, etc.)
│   ├── openapi/            # OpenAPI specification files
│   └── utils/              # Utility functions (JWT, pagination, etc.)
└── ...
```

## 4. Getting Started

### 4.1. Prerequisites

-   [Bun](https://bun.sh/docs/installation)
-   [Node.js](https://nodejs.org/) (for `npm` or `npx` if needed)
-   [PostgreSQL](https://www.postgresql.org/download/) running locally or on a server.
-   A Git client.

### 4.2. Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd backend
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

### 4.3. Environment Variables

Create a `.env` file in the root of the project by copying the example below.

**.env.example**
```env
# -------------------------
# Application Configuration
# -------------------------
# Environment: development, test, or production
NODE_ENV="development"
PORT=4000

# A single client URL for simple setups
CLIENT_URL="http://localhost:5173"
# For multiple clients, provide a comma-separated or JSON array of origins
# e.g., CLIENTS_URLS='["http://localhost:5173", "https://my-app.com"]'
CLIENTS_URLS=""

# -------------------------
# Security & API Keys
# -------------------------
# Basic auth credentials for the global API key guard
API_USERNAME="admin"
API_PASSWORD="password"

# JWT secrets (replace with strong, unique random strings)
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-jwt-refresh-key"
EMAIL_TOKEN_SECRET="your-super-secret-email-token-key"
RESET_SECRET="your-super-secret-password-reset-key"

# -------------------------
# Database
# -------------------------
# PostgreSQL connection URL
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"

# -------------------------
# Email Service (Nodemailer)
# -------------------------
# Credentials for your SMTP server (e.g., Gmail, SendGrid)
MAIL_USER="your-email@example.com"
MAIL_PASS="your-email-password-or-app-key"

# -------------------------
# Database Seeding (Optional)
# -------------------------
# Credentials for the initial admin user created during seeding
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="adminpassword"
```

### 4.4. Database Setup

Run the following command to create the database tables based on the `prisma/schema.prisma` file and run the seed script.

```bash
bun run db:dev
```
This will also execute `prisma/seed.ts` to populate the database with initial data, such as an admin user.

### 4.5. Running the Application

Start the development server with hot-reloading:

```bash
bun run dev
```

The API will be running at `http://localhost:4000` (or the `PORT` you specified).

## 5. API Architecture & Concepts

### 5.1. Modular Design

The application is divided into modules (e.g., `auth`, `products`). Each module is self-contained and typically includes:
-   `*.routes.ts`: Defines the API endpoints for the module.
-   `*.controller.ts`: Handles incoming requests, processes input, and sends responses.
-   `*.service.ts` (Optional but recommended): Contains the core business logic, separating it from the controller.
-   `*.validator.ts` (Optional): Zod schemas for request validation.

### 5.2. Authentication

The API uses a token-based authentication system with JWTs.
-   **Access Token**: A short-lived JWT (`15m`) sent as an `HttpOnly` cookie (`accessToken`). It is required for accessing protected resources.
-   **Refresh Token**: A long-lived JWT (`7d`) sent as an `HttpOnly` cookie (`refreshToken`). It is stored in the `Session` table and used to obtain a new access token when the current one expires.
-   **Token Rotation**: To enhance security, refresh tokens are single-use. When used, a new refresh token is generated, and the old one is revoked.
-   **Route Protection**: The `routeProtector` middleware (in `src/middlewares/`) is used to secure endpoints that require authentication.

### 5.3. Standard API Response

All API responses follow a consistent format defined by `ApiResponse` (`src/core/responses/ApiResponse.ts`).

**Success Response:**
```json
{
  "success": true,
  "message": "Descriptive message",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error message",
  "error": { ... } // Optional error details
}
```

### 5.4. API Documentation

Interactive API documentation is available at the `/docs` endpoint when the server is running. The OpenAPI 3.0 specification is served at `/openapi.json`.

### 5.5. API Modules

The backend is organized into the following API modules under the `/api/` prefix:

-   `/auth`: Authentication and session management.
-   `/users`: User management.
-   `/stores`: Seller store management.
-   `/products`: Product management.
-   `/categories`: Category management.
-   `/orders`: Order processing and history.
-   `/shipping`: Shipping method management (Seller-specific).
-   `/taxes`: Tax configuration (Seller-specific).
-   `/discounts`: Discount management (Seller-specific).
-   `/promotions`: Promotion and coupon management (Seller-specific).
-   `/loyalty`: Customer loyalty points system.
-   `/upload-image`: File upload endpoints.

## 6. Scripts

The following scripts are available in `package.json`:

| Script              | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `bun run dev`       | Starts the development server with hot-reloading.                           |
| `bun test`          | Runs the test suite.                                                        |
| `bun run start`     | Deploys migrations, seeds the DB, and starts the server for production.     |
| `bun run db:dev`    | Applies database migrations and seeds the database for development.         |
| `bun run db:reset`  | Resets the database, deleting all data.                                     |
| `bun run db:seed`   | Runs the database seed script.                                              |
| `bun run db:deploy` | Applies pending migrations, intended for production environments.           |
| `bun run openapi:build` | Merges individual OpenAPI JSON files into a single `openapi.json` file. |

## 7. AI Model Context

This section provides a condensed, structured summary for AI models to understand and interact with the codebase.

### 7.1. System Persona

-   **You are**: A backend API for a multi-seller e-commerce platform.
-   **Your purpose**: To provide a secure, modular, and scalable foundation for e-commerce features.
-   **Core Technologies**: Your stack is Bun (runtime), Express.js (framework), TypeScript (language), PostgreSQL (database), and Prisma (ORM).

### 7.2. Architectural Principles

1.  **Modularity**: The codebase is organized into feature-based modules located in `src/modules`. Each module (e.g., `products`, `orders`) should be as self-contained as possible.
2.  **Thin Controllers**: Controllers (`*.controller.ts`) are responsible for handling HTTP requests and responses. They should be lightweight, delegating complex business logic to services.
3.  **Service Layer**: Business logic should be encapsulated within services (`*.service.ts`). This promotes separation of concerns and reusability.
4.  **Standardized Responses**: All API responses MUST use the `ApiResponse` wrapper from `src/core/responses/ApiResponse.ts` to ensure a consistent ` { success, message, data | error } ` structure.
5.  **Validation**: All incoming request data (body, params, query) should be validated using Zod schemas. See `src/middlewares/zodValidator.ts` for the implementation pattern.

### 7.3. Authentication & Security

-   **Mechanism**: Authentication is handled via JWTs, using a pair of an `accessToken` and a `refreshToken`.
-   **Storage**: Tokens are stored in `HttpOnly` cookies to mitigate XSS attacks.
-   **Flow**: The `accessToken` is short-lived and used for API requests. The `refreshToken` is long-lived, stored in the `Session` database table, and used to obtain a new `accessToken`.
-   **Key Feature**: **Refresh Token Rotation** is implemented. Each refresh token can only be used once.
-   **Middleware**:
    -   `apiKeyGuard`: A global middleware that protects all API endpoints with a basic username/password check. Credentials are set via `API_USERNAME` and `API_PASSWORD` env variables.
    -   `routeProtector`: An endpoint-specific middleware to ensure a user is authenticated. Apply this to any route that requires a logged-in user.

### 7.4. Database

-   **Source of Truth**: The `prisma/schema.prisma` file is the definitive source for the database schema.
-   **Key Models**: The most important models are `User`, `Store`, `Product`, `Category`, and `Order`.
-   **Convention**: Soft deletes are used for critical models like `User` and `Store`. This is implemented with an `isDeleted` boolean flag and a `deletedAt` timestamp.

### 7.5. Workflow: How to Add a New Module

To add a new feature (e.g., "reviews"), follow this sequence:

1.  **Update Schema**: Add the `Review` model to `prisma/schema.prisma` and define its relations.
2.  **Migrate Database**: Run `bun run db:dev` to apply the schema changes.
3.  **Create Module Folder**: Create a new directory `src/modules/reviews`.
4.  **Create Controller**: Create `src/modules/reviews/reviews.controller.ts` to handle the request/response logic.
5.  **Create Routes**: Create `src/modules/reviews/reviews.routes.ts`. Import the controller functions and define the endpoints (e.g., `POST /reviews`, `GET /products/:productId/reviews`).
6.  **Register Routes**: In `src/app.ts`, import the new router and register it with a base path:
    ```typescript
    import reviewsRoutes from "./modules/reviews/reviews.routes";
    // ...
    app.use("/api/reviews", reviewsRoutes);
    ```
7.  **Add Validation**: (Optional but recommended) Create `src/modules/reviews/validator.ts` with Zod schemas for the new endpoints and apply them as middleware in the routes file.