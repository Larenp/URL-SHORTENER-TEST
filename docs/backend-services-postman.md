# Backend Services and Postman Guide

This backend is a NestJS API for authenticated, tenant-scoped URL management.
The implemented HTTP surface is health checks, authentication, and URL CRUD.
Public redirects and analytics are described in architecture docs as future
work; there is no redirect or analytics controller in the current codebase.

## Local Setup

Use Node.js 20+ and install dependencies from the repository root:

```bash
npm install
```

Start the required infrastructure:

```bash
docker compose up -d
```

Create `backend/.env` from `backend/.env.example`:

```bash
cp backend/.env.example backend/.env
```

Required backend environment variables:

| Variable | Purpose | Local example |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | API port | `3000` |
| `API_PREFIX` | Global API prefix | `api` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |
| `LOG_LEVEL` | Pino/Nest log level | `info` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5433/url_shortener` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Access-token signing secret, 32+ chars | see `.env.example` |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime | `15m` |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret, 32+ chars and different from access secret | see `.env.example` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token lifetime | `7d` |

This repository currently has `backend/prisma/schema.prisma` and no checked-in
Prisma migration folder. For local development, push the schema and seed data:

```bash
npx prisma db push --schema backend/prisma/schema.prisma
npm run seed
```

Seeded login:

```text
email: dev@example.com
password: devpassword123
role: TENANT_ADMIN
```

Start the backend:

```bash
npm run dev:backend
```

The API base URL is `http://localhost:3000/api/v1`. The health endpoint is
version-neutral and is available at `http://localhost:3000/health`.

## Backend Services

| Service/module | What it does |
| --- | --- |
| Config | Loads and validates required environment variables with Joi. Startup fails fast when required values are missing or invalid. |
| Logger | Configures request/application logging through `nestjs-pino`. |
| Database | Owns the Prisma client and connects to PostgreSQL on startup with retry/backoff. |
| Cache | Owns the Redis client and connects on startup. Used by health checks today and intended for redirect/session caching later. |
| Health | Exposes `/health` and checks memory, PostgreSQL, and Redis. |
| Auth | Logs users in, issues JWT access/refresh tokens, rotates refresh tokens, and logs users out. |
| Users | Internal service for finding users and storing refresh-token hashes. No public user CRUD API exists yet. |
| Tenant | Stores tenant/user context from the JWT and applies tenant scoping to Prisma `user` and `url` queries. |
| Authorization | Enforces role/permission checks. `TENANT_ADMIN` can manage tenant URLs; `MEMBER` can manage only URLs they created. |
| URL | Authenticated tenant-scoped URL CRUD with soft delete. |

## Postman Environment

Create a Postman environment with these variables:

| Variable | Initial value |
| --- | --- |
| `baseUrl` | `http://localhost:3000` |
| `apiBase` | `{{baseUrl}}/api/v1` |
| `accessToken` | empty, set after login |
| `refreshToken` | empty, set after login |
| `urlId` | empty, set after creating a URL |
| `customCode` | `mentor-demo` |

For protected requests, add this header:

```text
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

## Health API

### Check Service Health

```http
GET {{baseUrl}}/health
```

Successful response:

```json
{
  "status": "ok",
  "info": {
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "database": { "status": "up" },
    "cache": { "status": "up" }
  },
  "error": {},
  "details": {
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "database": { "status": "up" },
    "cache": { "status": "up" }
  }
}
```

## Auth API

### Login

```http
POST {{apiBase}}/auth/login
Content-Type: application/json
```

Body:

```json
{
  "email": "dev@example.com",
  "password": "devpassword123"
}
```

Successful response:

```json
{
  "accessToken": "<jwt access token>",
  "refreshToken": "<jwt refresh token>",
  "expiresIn": 900
}
```

In Postman, save tokens with a Tests script:

```javascript
const body = pm.response.json();
pm.environment.set('accessToken', body.accessToken);
pm.environment.set('refreshToken', body.refreshToken);
```

### Refresh Tokens

```http
POST {{apiBase}}/auth/refresh
Content-Type: application/json
```

Body:

```json
{
  "refreshToken": "{{refreshToken}}"
}
```

Successful response has the same shape as login and rotates the stored refresh
token hash.

### Logout

```http
POST {{apiBase}}/auth/logout
Authorization: Bearer {{accessToken}}
```

Successful response: `204 No Content`. This clears the stored refresh-token
hash for the current user.

## URL CRUD API

All URL routes require `Authorization: Bearer {{accessToken}}`.

### Create URL

```http
POST {{apiBase}}/urls
Content-Type: application/json
Authorization: Bearer {{accessToken}}
```

Body with an auto-generated short code:

```json
{
  "originalUrl": "https://example.com/articles/backend-demo",
  "title": "Backend demo"
}
```

Body with a custom short code:

```json
{
  "originalUrl": "https://example.com/articles/backend-demo",
  "customCode": "{{customCode}}",
  "title": "Backend demo"
}
```

Successful response:

```json
{
  "id": "url-id",
  "tenantId": "tenant-id",
  "createdById": "user-id",
  "shortCode": "mentor-demo",
  "originalUrl": "https://example.com/articles/backend-demo",
  "title": "Backend demo",
  "deletedAt": null,
  "createdAt": "2026-07-27T00:00:00.000Z",
  "updatedAt": "2026-07-27T00:00:00.000Z"
}
```

Save the ID in Postman:

```javascript
pm.environment.set('urlId', pm.response.json().id);
```

### List URLs

```http
GET {{apiBase}}/urls?page=1&limit=20
Authorization: Bearer {{accessToken}}
```

Optional search:

```http
GET {{apiBase}}/urls?search=backend&page=1&limit=10
```

Successful response:

```json
{
  "data": [
    {
      "id": "url-id",
      "tenantId": "tenant-id",
      "createdById": "user-id",
      "shortCode": "mentor-demo",
      "originalUrl": "https://example.com/articles/backend-demo",
      "title": "Backend demo",
      "deletedAt": null,
      "createdAt": "2026-07-27T00:00:00.000Z",
      "updatedAt": "2026-07-27T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Read One URL

```http
GET {{apiBase}}/urls/{{urlId}}
Authorization: Bearer {{accessToken}}
```

Successful response is one URL object.

### Update URL

```http
PATCH {{apiBase}}/urls/{{urlId}}
Content-Type: application/json
Authorization: Bearer {{accessToken}}
```

Body:

```json
{
  "title": "Updated backend demo",
  "originalUrl": "https://example.com/articles/updated-backend-demo"
}
```

Successful response is the updated URL object.

### Delete URL

```http
DELETE {{apiBase}}/urls/{{urlId}}
Authorization: Bearer {{accessToken}}
```

Successful response: `204 No Content`. The row is soft-deleted by setting
`deletedAt`; list/read routes exclude soft-deleted URLs.

## Database CRUD Through APIs

Available API-backed database operations:

| Table/model | Create | Read | Update | Delete |
| --- | --- | --- | --- | --- |
| `urls` | `POST /api/v1/urls` | `GET /api/v1/urls`, `GET /api/v1/urls/:id` | `PATCH /api/v1/urls/:id` | `DELETE /api/v1/urls/:id` soft delete |
| `users` | Seed script only | Auth service reads user by email/id during login/refresh | Auth service updates `refreshTokenHash` during login/refresh/logout | No public API |
| `tenants` | Seed script only | Tenant ID comes from JWT claims | No public API | No public API |

Tenant isolation is automatic for `users` and `urls` through the tenant Prisma
extension. A user can only query URLs for their tenant. `MEMBER` users can
update/delete only their own URLs; `TENANT_ADMIN` users can update/delete any
URL in the tenant.

## Common Error Cases

### Missing environment variables

Startup error:

```text
Config validation error: "DATABASE_URL" is required. "REDIS_URL" is required. "JWT_ACCESS_SECRET" is required. "JWT_REFRESH_SECRET" is required
```

Fix: create `backend/.env` from `backend/.env.example` or export the required
variables before running the backend.

### Database connection failure

Typical error:

```text
Database connection failed
```

Fix: ensure Postgres is running, `DATABASE_URL` points to the right port and
credentials, and run `npx prisma db push --schema backend/prisma/schema.prisma`
before seeding.

### Redis connection failure

Typical error:

```text
Cache connection failed
```

Fix: ensure Redis is running and `REDIS_URL` is correct.

### Unauthorized request

Response:

```json
{
  "statusCode": 401,
  "message": "Missing bearer token",
  "error": "Unauthorized"
}
```

Fix: login and send `Authorization: Bearer {{accessToken}}`.

### Invalid or expired token

Response:

```json
{
  "statusCode": 401,
  "message": "Invalid or expired token",
  "error": "Unauthorized"
}
```

Fix: call `POST /api/v1/auth/refresh` with a valid refresh token, then update
the Postman `accessToken`.

### Duplicate custom short code

Response:

```json
{
  "statusCode": 409,
  "message": "Short code \"mentor-demo\" is already in use",
  "error": "SHORT_CODE_ALREADY_EXISTS"
}
```

Fix: choose a different `customCode` or omit `customCode` to auto-generate one.

### Validation errors

Examples:

```json
{
  "statusCode": 400,
  "message": ["originalUrl must be a URL address"],
  "error": "Bad Request"
}
```

Fix: send `http://` or `https://` URLs, keep `customCode` to letters, numbers,
hyphens, and underscores, and use `page >= 1`, `limit <= 100`.

### Not found after delete

`DELETE /api/v1/urls/:id` soft-deletes a URL. A later `GET /api/v1/urls/:id`
returns:

```json
{
  "statusCode": 404,
  "message": "URL not found",
  "error": "URL_NOT_FOUND"
}
```
