# System Architecture

![System architecture](../assets/diagrams/system-architecture.png)

## Components

**React frontend** — Tenant admin dashboard, platform admin dashboard, and
the login/URL-management/analytics screens. Talks to the backend
exclusively over HTTPS REST; holds no direct database or cache access.

**NestJS backend** — A single application handling authentication,
tenancy, URL management, and analytics through distinct modules. Requests
pass through three layers in order: JWT authentication guard,
role-based authorization guard, tenant context interceptor. See
[Request Lifecycle](./request-lifecycle.md) for why that ordering matters
(and for a correction on why the tenant step is an interceptor, not
literal middleware, despite the name in the diagram above).

**Controllers and services** — One pair per domain (auth, tenant, URL,
analytics). Controllers own HTTP concerns (routing, status codes, request
shape); services own business logic. This split exists so business rules
are testable without a running HTTP server and reusable from non-HTTP
entry points later (a queue worker, a CLI).

**Prisma ORM** — The only data-access path services use. Centralizing
access here is what makes tenant-scoped filtering enforceable in one place
rather than trusted to be correct at every call site.

**PostgreSQL** — System of record for tenants, users, URLs, and click
analytics. Chosen over a NoSQL store because the domain is inherently
relational and several operations (creating a link against a tenant quota,
for example) need transactional guarantees.

**Redis** — Backs the redirect cache, rate limiting, and session/token
concerns. Everything Redis holds is either derived from Postgres or safe
to lose; it is never the source of truth.

## Two distinct traffic patterns

The system has two request shapes that don't share a code path:

1. **Authenticated management traffic** — dashboard and API clients
   creating/editing links, viewing analytics. Goes through the full guard
   chain, reads and writes Postgres directly through Prisma.
2. **Public redirect traffic** — anyone clicking a short link. No
   authentication, no tenant guard chain (the tenant is implied by the
   link itself, not by a caller identity). Optimized for latency: Redis
   first, Postgres only on a cache miss.

Treating these as one undifferentiated "API" would force the redirect path
through unnecessary auth overhead, and would force the management path to
tolerate the loose consistency that's acceptable for a cache-backed
redirect. Keeping them distinct is what allows each to be optimized for
what it actually needs.

## Related pages

- [Request Lifecycle](./request-lifecycle.md)
- [Redirect Flow](./redirect-flow.md)
- [URL Management](./url-management.md)
- [Caching Strategy](./caching-strategy.md)
- [Analytics Flow](./analytics-flow.md)
- [Authentication Flow](./authentication-flow.md)
- [Tenant Isolation](./tenant-isolation.md)
- [Design Decisions](./decisions.md)
