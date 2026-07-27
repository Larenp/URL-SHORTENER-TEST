# Comprehensive Technical Architecture & Application Analysis

This report presents an end-to-end technical analysis of the **URL Shortener & Analytics Platform** based strictly on the codebase implementation.

---

## 1. Project Overview

### Problem Solved
The platform provides a secure, multi-tenant URL management system that allows organizations to issue, manage, search, and delete shortened URLs while enforcing strict data isolation between tenants, role-based access control (RBAC), and security standards.

### Intended Users
* **Tenant Admins (`TENANT_ADMIN`)**: Organization administrators who manage all URLs, users, and tenant settings within their organization.
* **Members (`MEMBER`)**: Organization members who can create shortened links and manage their own created links within their organization's workspace.

### Core Features (Implemented)
* **Multi-Tenant Isolation**: Request-level tenant context propagation using Node.js `AsyncLocalStorage` and Prisma Client Query Extensions.
* **JWT Authentication**: Short-lived Access Tokens (15m) and long-lived Refresh Tokens (7d) with cryptographically secure token rotation and SHA-256 stored token hashing.
* **Timing-Attack Resistance**: Constant-time password verification using bcrypt decoy hashes to prevent user enumeration.
* **Role-Based Access Control (RBAC)**: Fine-grained permissions (`URL_CREATE`, `URL_READ`, `URL_MANAGE_OWN`, `URL_MANAGE`).
* **URL Management**: URL creation with custom short codes or auto-generated collision-resistant short codes, pagination, case-insensitive search, and soft deletion (`deletedAt`).
* **Health Monitoring**: System health indicators for memory heap, memory RSS, PostgreSQL database connectivity, and Redis cache ping via NestJS Terminus (`/health`).

---

## 2. High-Level Architecture

The project is structured as an npm workspaces monorepo containing a NestJS backend REST API and a Vite + React frontend workspace.

```
+-----------------------------------------------------------------------------------+
|                                 BROWSER CLIENT                                    |
+-----------------------------------------------------------------------------------+
       |                                                                ^
       | HTTP / API Requests (Port 3000)                                | JSON Response
       v                                                                |
+-----------------------------------------------------------------------------------+
|                                 NESTJS BACKEND                                    |
|                                                                                   |
|  [Helmet / CORS] -> [JwtAuthGuard] -> [AuthorizationGuard] -> [TenantInterceptor]  |
|                                                                                   |
|       +------------------------+        +----------------------------------+      |
|       |  Controllers & Services |        | TenantContextService             |      |
|       |  (Auth, Users, Url)    |        | (Node.js AsyncLocalStorage)      |      |
|       +------------------------+        +----------------------------------+      |
|                   |                                       |                       |
|                   v                                       v                       |
|       +------------------------------------------------------------------+        |
|       |  TenantPrismaService (Prisma Client Extension $extends)          |        |
|       +------------------------------------------------------------------+        |
+-----------------------------------------------------------------------------------+
          | (Port 5433)                                           | (Port 6380)
          v                                                       v
+-----------------------------+                         +---------------------------+
| PostgreSQL (Docker Container)|                         | Redis (Docker Container)  |
|  - tenants                  |                         |  - Connection Ping        |
|  - users                    |                         |  - Infrastructure Ready   |
|  - urls                     |                         +---------------------------+
+-----------------------------+
```

### Component Roles
1. **Frontend (`/frontend`)**: A Vite + React application workspace initialized as a client entry point.
2. **Backend API (`/backend`)**: Built with NestJS, Pino logger, Helmet, and class-validator DTOs.
3. **Database (`PostgreSQL 16`)**: Relational storage managed via Prisma ORM 6.x.
4. **Cache (`Redis 7`)**: Redis cache connected via `ioredis` (`RedisService`), monitored via `RedisHealthIndicator`.

---

## 3. Complete User Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant FE as Frontend Workspace
    participant Guard as Jwt & Auth Guards
    participant Interceptor as Tenant Context Interceptor
    participant Service as UrlService
    participant Prisma as TenantPrisma (Extension)
    participant DB as PostgreSQL DB

    User->>FE: Open Website & Submit Login (email, password)
    FE->>Guard: POST /api/v1/auth/login
    Guard-->>Service: Verify bcrypt password (or decoy hash)
    Service-->>FE: Return Access Token & Refresh Token
    
    User->>FE: Create Shortened URL (URL, customCode?)
    FE->>Guard: POST /api/v1/urls (Header: Bearer JWT)
    Guard->>Guard: Validate JWT & Verify Permission (URL_CREATE)
    Guard->>Interceptor: Pass execution
    Interceptor->>Interceptor: Extract tenantId & set AsyncLocalStorage
    Interceptor->>Service: Execute UrlService.create()
    Service->>Prisma: client.url.create({ data })
    Prisma->>Prisma: Inject tenantId automatically from AsyncLocalStorage
    Prisma->>DB: INSERT INTO urls (id, tenantId, createdById, shortCode, ...)
    DB-->>Prisma: Return created Url record
    Prisma-->>FE: Return HTTP 201 Created JSON
```

---

## 4. Backend Architecture & Pipeline

### Core Modules (`/backend/src`)
* **`AppModule` (`app.module.ts`)**: Root application module importing configuration, logging, database, cache, auth, tenant, users, and URL modules.
* **`AuthModule` (`auth/auth.module.ts`)**: Handles user authentication, password hashing, and JWT token lifecycle.
* **`AuthorizationModule` (`authorization/authorization.module.ts`)**: Enforces Role-Based Access Control via `AuthorizationGuard`.
* **`TenantModule` (`tenant/tenant.module.ts`)**: Provides `TenantContextService`, `TenantContextInterceptor`, and `TenantPrismaService`.
* **`UrlModule` (`url/url.module.ts`)**: Handles short URL creation, pagination, searching, ownership assertion, and soft deletion.
* **`DatabaseModule` (`database/database.module.ts`)**: Provides `PrismaService` connected to PostgreSQL with retry backoff logic.
* **`CacheModule` (`cache/cache.module.ts`)**: Provides `RedisService` (`ioredis`) with connection retries and lifecycle hooks.
* **`HealthModule` (`health/health.module.ts`)**: Health indicator endpoints using NestJS Terminus.

### Request Lifecycle inside NestJS
1. **Middleware Layer**: Helmet sets HTTP security headers; CORS validates origins.
2. **Global Exception Filter**: `AllExceptionsFilter` catches exceptions and formats standardized RFC 7807 / JSON responses.
3. **Guards Layer**:
   - `JwtAuthGuard`: Extracts Bearer JWT token from `Authorization` header, verifies signature, populates `request.user`.
   - `AuthorizationGuard`: Reads `@Public()`, `@Roles()`, or `@RequirePermissions()` metadata via `Reflector` and verifies permissions.
4. **Interceptors Layer**:
   - `TenantContextInterceptor`: Reads `request.user.tenantId` and calls `TenantContextService.enterWith()`.
5. **Validation Pipes**: `ValidationPipe` transforms and validates payload against DTO class validators (`whitelist: true`, `forbidNonWhitelisted: true`).
6. **Controller & Service Layer**: Controller delegates business logic to Service.
7. **Prisma Extension Layer**: `TenantPrismaService` executes queries through `tenantScopingExtension`, appending `where: { tenantId }` or `data: { tenantId }` automatically.

---

## 5. Frontend Flow

* **Implemented State**: The frontend workspace (`/frontend`) is initialized using Vite, React 19, TypeScript, and ESLint. Its root component (`frontend/src/App.tsx`) renders a placeholder interface.
* **Planned State**: React components, routing, form management, and Axios/Fetch API integration to consume the backend `/api/v1` REST endpoints.

---

## 6. Database Design

Managed via Prisma schema (`backend/prisma/schema.prisma`).

```mermaid
erDiagram
    TENANTS ||--o{ USERS : "has many"
    TENANTS ||--o{ URLS : "has many"
    USERS ||--o{ URLS : "creates"

    TENANTS {
        string id PK "uuid"
        string name
        string slug UK
        datetime createdAt
        datetime updatedAt
    }

    USERS {
        string id PK "uuid"
        string tenantId FK "tenants.id"
        string email UK
        string passwordHash
        Role role "TENANT_ADMIN | MEMBER"
        string refreshTokenHash "nullable"
        datetime createdAt
        datetime updatedAt
    }

    URLS {
        string id PK "uuid"
        string tenantId FK "tenants.id"
        string createdById FK "users.id"
        string shortCode UK
        string originalUrl
        string title "nullable"
        datetime deletedAt "nullable"
        datetime createdAt
        datetime updatedAt
    }
```

### Models & Tables
1. **`Tenant` (`tenants`)**: Multi-tenant organization. Identified by `id` (UUID) and `slug` (unique string).
2. **`User` (`users`)**: User belongs to a `tenantId`. Role is `TENANT_ADMIN` or `MEMBER`. Stores `passwordHash` (bcrypt) and `refreshTokenHash` (SHA-256).
3. **`Url` (`urls`)**: Shortened URL entity. Linked to `tenantId` and `createdById`. Contains `shortCode` (unique), `originalUrl`, `title`, and `deletedAt` (soft-delete timestamp).

---

## 7. Redis Usage

* **Implementation File**: `backend/src/cache/redis.service.ts`
* **Library**: `ioredis` with lazy connection and exponential retry backoff strategy.
* **Health Check Integration**: Monitored in `backend/src/health/indicators/redis-health.indicator.ts` by performing a `PING` command when `/health` is invoked.
* **Role**: Serves as the caching and rate-limiting infrastructure for low-latency short code resolution and request throttling.

---

## 8. API Documentation

Base Path: `/api/v1` (Except `/health` which is excluded from global prefix).

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Public | Authenticates user with email/password; returns access & refresh tokens. |
| `POST` | `/api/v1/auth/refresh` | Public | Verifies refresh token & hash match; issues new token pair. |
| `POST` | `/api/v1/auth/logout` | Bearer JWT | Revokes user refresh token by setting `refreshTokenHash` to `null`. |
| `POST` | `/api/v1/urls` | Bearer JWT (`URL_CREATE`) | Creates a short URL with custom code or collision-resistant generated code. |
| `GET` | `/api/v1/urls` | Bearer JWT (`URL_READ`) | Lists tenant URLs with pagination (`page`, `limit`) and case-insensitive search (`search`). |
| `GET` | `/api/v1/urls/:id` | Bearer JWT (`URL_READ`) | Retrieves single non-deleted URL by ID for the active tenant. |
| `PATCH` | `/api/v1/urls/:id` | Bearer JWT (`URL_MANAGE_OWN`) | Updates title/URL. Enforces that `MEMBER` users can only update their own URLs. |
| `DELETE` | `/api/v1/urls/:id` | Bearer JWT (`URL_MANAGE_OWN`) | Soft-deletes URL (`deletedAt = now()`). Enforces creator or admin rights. |
| `GET` | `/health` | Public | Returns system health metrics (Heap, RSS, Postgres DB, Redis Cache). |

---

## 9. Authentication & Security

1. **Decoy Password Hash against Enumeration Attacks**:
   In `auth.service.ts`, if an email does not exist, `bcrypt.compare` is still executed against a fixed decoy hash (`DECOY_PASSWORD_HASH`) to ensure constant response times and prevent account enumeration.
2. **Refresh Token Hashing**:
   Refresh tokens are hashed using SHA-256 (`hashToken()`) before saving to PostgreSQL. Comparisons use `timingSafeEqual()` to eliminate timing side-channel attacks.
3. **Automatic Tenant Scoping**:
   The `tenantScopingExtension` automatically injects `tenantId` into `where` clauses for `findUnique`, `findFirst`, `findMany`, `count`, `update`, `delete`, and into `data` for `create` and `createMany`.
4. **Helmet Security**:
   Sets HTTP headers including `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and `Content-Security-Policy`.

---

## 10. Business Logic Algorithms

### Short Code Generation (`url-code.util.ts`)
* Uses a URL-safe base62 alphabet (`0-9a-zA-Z`).
* Generates random 7-character candidate strings using `crypto.getRandomValues()`.
* Implements collision retry logic (`generateUniqueShortCode`): retries up to 3 times if a unique constraint error (`P2002`) on `shortCode` occurs before throwing `ShortCodeGenerationFailedException`.

### Resource Ownership Authorization (`assertCanManage`)
* `TENANT_ADMIN` possesses `URL_MANAGE` and can update/delete any URL in their tenant workspace.
* `MEMBER` possesses `URL_MANAGE_OWN` and can only update/delete URLs where `url.createdById === currentUser.sub`.

---

## 11. Environment & Configuration

Environment configuration is validated on startup via Joi schema (`backend/src/config/env.validation.ts`):

* `NODE_ENV`: `development` | `production` | `test`
* `PORT`: Server HTTP port (default: `3000`)
* `DATABASE_URL`: PostgreSQL connection string (`postgresql://postgres:postgres@localhost:5433/url_shortener`)
* `REDIS_URL`: Redis connection string (`redis://localhost:6380`)
* `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: 32-character min secret keys.
* `JWT_ACCESS_EXPIRES_IN`: Access token TTL (default: `15m`).
* `JWT_REFRESH_EXPIRES_IN`: Refresh token TTL (default: `7d`).

---

## 12. Complete Request Lifecycle (Trace Example)

1. **HTTP Request**: Client sends `POST /api/v1/urls` with header `Authorization: Bearer <token>` and body `{"originalUrl": "https://example.com"}`.
2. **NestJS Pipeline**:
   - `Helmet` processes headers.
   - `JwtAuthGuard` extracts token, verifies JWT, and attaches `request.user = { sub, email, tenantId, role }`.
   - `AuthorizationGuard` checks metadata `@RequirePermissions(URL_CREATE)` and verifies `hasAllPermissions(role, [URL_CREATE])`.
   - `TenantContextInterceptor` reads `request.user.tenantId` and sets `TenantContextService` AsyncLocalStorage store.
   - `ValidationPipe` parses and validates `CreateUrlDto`.
3. **Service & Database Execution**:
   - `UrlController.create()` calls `UrlService.create()`.
   - `UrlService` invokes `generateUniqueShortCode()` generating candidate `aB3xZ9q`.
   - `this.tenantPrisma.client.url.create()` is invoked.
   - `tenantScopingExtension` reads `tenantId` from `TenantContextService` and appends `tenantId` to the create payload.
   - `PrismaService` runs SQL `INSERT INTO urls ("id", "tenantId", "createdById", "shortCode", "originalUrl") VALUES (...)` against PostgreSQL on port 5433.
4. **Response**: PostgreSQL returns the inserted record. NestJS serializes it to JSON and responds with `HTTP 201 Created`.

---

## 14. Summary

The **URL Shortener Platform** is a multi-tenant application. It features a robust multi-tenant context propagation mechanism (`AsyncLocalStorage` + Prisma query extensions), security controls against timing attacks and account enumeration, JWT rotation with SHA-256 token hashing, role-based authorization, and automated database/redis containerization.
