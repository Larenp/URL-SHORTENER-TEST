# URL Shortener Platform

A multi-tenant URL shortening and analytics platform. Each tenant manages
its own short links, users, and click analytics, fully isolated from every
other tenant on shared infrastructure.

## Features

- Tenant-scoped URL creation, management, and redirection
- Per-tenant click analytics
- Role-based access within each tenant
- JWT-based authentication with short-lived access tokens and rotating refresh tokens
- Row-level tenant isolation on a shared database

## Tech Stack

| Layer    | Choice                    |
| -------- | ------------------------- |
| Backend  | NestJS, TypeScript        |
| Database | PostgreSQL via Prisma ORM |
| Cache    | Redis                     |
| Frontend | React, Vite, TypeScript   |
| Auth     | JWT                       |

## Architecture at a Glance

![System architecture](./docs/assets/diagrams/system-architecture.png)

Requests pass through an ordered guard chain (authentication → tenant
resolution → authorization) before reaching business logic; public
redirects follow a separate, unauthenticated, cache-first path. Full
breakdown in [`docs/architecture/overview.md`](./docs/architecture/overview.md).

## Installation

```bash
git clone <repo-url>
cd url-shortener-platform
npm install
```

This is an npm workspaces monorepo — one install at the root covers both
`backend` and `frontend`.

## Environment Setup

Start Postgres and Redis (see [Local Infrastructure](#local-infrastructure) below):

```bash
docker compose up -d
```

Then set up environment files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The defaults in `backend/.env.example` already match `docker-compose.yml`,
so no edits are needed for local development.

## Local Infrastructure

Postgres and Redis run in Docker; the backend and frontend run natively
(`npm run dev:*`) for fast reload during development.

```bash
docker compose up -d      # start Postgres + Redis
docker compose ps         # check health status
docker compose down       # stop containers (data persists in named volumes)
docker compose down -v    # stop containers and delete all data
```

## Running Locally

```bash
npm run dev:backend   # NestJS API — http://localhost:3000
npm run dev:frontend  # Vite dev server — http://localhost:5173
```

## Useful Scripts

| Command                  | Description                |
| ------------------------- | --------------------------- |
| `npm run build`           | Build both apps             |
| `npm run build:backend`   | Build the API only          |
| `npm run build:frontend`  | Build the frontend only     |
| `npm run lint`            | Lint both apps               |
| `npm run format`          | Format source with Prettier |
| `npm run test`            | Run backend unit tests |
| `npm run seed`            | Seed a local test user (dev@example.com) |

## Folder Navigation

```
backend/      NestJS API — see backend/src for module layout
frontend/     React dashboard
docs/         Architecture, design decisions, and concept documentation
docker-compose.yml   Local Postgres + Redis for development
```

## Documentation

Setup and scripts stop here — everything about how the system is designed
and why lives in [`docs/`](./docs/README.md):

- [Why URL Shorteners Exist](./docs/concepts/url-shorteners.md)
- [Why Multi-Tenancy](./docs/concepts/multi-tenancy.md)
- [System Architecture](./docs/architecture/overview.md)
- [Request Lifecycle](./docs/architecture/request-lifecycle.md)
- [Redirect Flow](./docs/architecture/redirect-flow.md)
- [URL Management](./docs/architecture/url-management.md)
- [Caching Strategy](./docs/architecture/caching-strategy.md)
- [Analytics Flow](./docs/architecture/analytics-flow.md)
- [Authentication Flow](./docs/architecture/authentication-flow.md)
- [Tenant Isolation](./docs/architecture/tenant-isolation.md)
- [Design Decisions](./docs/architecture/decisions.md)
- [Future Improvements](./docs/future-improvements.md)

## License

Unlicensed — portfolio project.
# URL-SHORTENER
