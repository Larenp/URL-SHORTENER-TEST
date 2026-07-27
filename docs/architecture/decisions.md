# Design Decisions

Short-form record of decisions that shaped the architecture, in the order
they matter to a new contributor. Not a full ADR log — just the ones worth
explaining rather than leaving implicit.

## Shared database, row-level tenant isolation

**Decision:** one Postgres database, one schema, every tenant-owned table
carries `tenantId`, every query filtered by it.

**Alternatives considered:** database-per-tenant, schema-per-tenant.

**Why not chosen:** both scale operational cost linearly with tenant
count — every migration, backup, and monitoring concern multiplies per
tenant. Neither is justified at this platform's scale. See
[Tenant Isolation](./tenant-isolation.md) and
[Why Multi-Tenancy](../concepts/multi-tenancy.md).

## Tenant identity from JWT claims, never from client input

**Decision:** `tenantId` is resolved exclusively from a verified JWT and
never accepted as a request parameter.

**Why:** the alternative — trusting a client-supplied tenant ID — makes
tenant isolation dependent on the client behaving honestly, which is not a
security boundary. Full reasoning in
[Authentication Flow](./authentication-flow.md).

## Ordered guard chain over one combined guard

**Decision:** authentication, tenant resolution, and role authorization
are three separate, strictly ordered guards rather than one combined
check.

**Why:** each concern evolves independently in practice (a second auth
method, a change to role logic) and coupling them would mean every change
touches unrelated logic. Full reasoning in
[Request Lifecycle](./request-lifecycle.md).

## Redis is always a derived cache, never a source of truth

**Decision:** every key Redis holds is either reconstructable from
Postgres or inherently ephemeral (rate-limit counters).

**Why:** this is what allows the redirect path to fail open to Postgres
and rate limiting to fail open entirely, without a data-loss story if
Redis is flushed or restarted. Full reasoning in
[Caching Strategy](./caching-strategy.md).

## Structured logging (Pino) over default console logging

**Decision:** all application logs are structured JSON via `nestjs-pino`,
with request/response logging automatic and sensitive headers redacted.

**Why:** unstructured console logs are unqueryable in any real log
aggregation setup. JSON logs from day one avoid a rework later, at
negligible added complexity now.

## Global exception filter as a provider, not a manual instance

**Decision:** the exception filter is registered via `APP_FILTER` in
`AppModule` rather than instantiated directly in `main.ts`.

**Why:** it depends on the request-scoped logger, which cannot be
resolved with `app.get()` outside the DI container. Registering it as a
provider lets Nest construct it correctly per-request. This also keeps
bootstrap (`main.ts`) limited to process-level concerns — server startup
and global middleware — rather than mixing in DI-managed application
components.

## Health check without a database dependency

**Decision:** the initial health endpoint checks process memory, not
database or cache connectivity.

**Why:** at the foundation stage, no database exists yet to check. The
health check will expand to include Postgres and Redis connectivity once
those are wired up, rather than shipping a health check that always fails
in the meantime.

## Fail-fast on infrastructure connection at startup

**Decision:** `PrismaService` and `RedisService` attempt to connect
during `onModuleInit`, with a short retry-with-backoff, and let the
application crash on startup if the connection ultimately fails — rather
than starting successfully and only failing later on first use.

**Why:** a backend that reports itself as started while unable to reach
its database or cache produces confusing failures downstream, on the
first request rather than at deploy time. Failing at startup makes a
misconfigured environment visible immediately, which is the standard
expectation for stateful dependencies in production services. This is
distinct from the health check's own posture — see
[Caching Strategy](./caching-strategy.md), where Redis is explicitly
allowed to fail open *after* startup for non-critical paths like rate
limiting.

## Prisma and Redis modules are global

**Decision:** `DatabaseModule` and `CacheModule` are marked `@Global()`
so `PrismaService` and `RedisService` don't need to be re-imported into
every feature module that needs data access.

**Why:** both are accessed from nearly every domain module the platform
will eventually have (auth, tenant, URL, analytics). Requiring each one
to import the same infrastructure module individually adds repetition
without adding any real encapsulation benefit — there is no scenario
where one feature module should have a *different* database connection
than another.

## ioredis over @nestjs/cache-manager

**Decision:** the cache layer uses `ioredis` directly, wrapped in a thin
`RedisService`, rather than `@nestjs/cache-manager`'s abstraction.

**Why:** `cache-manager`'s store-agnostic interface is built for simple
get/set caching and doesn't cleanly expose Redis-specific operations this
platform needs — atomic counters for rate limiting, `PING` for health
checks. Using the Redis client directly avoids fighting an abstraction
that would need to be worked around almost immediately.

## Hand-rolled JWT guard over Passport

**Decision:** `JwtAuthGuard` is a small custom `CanActivate` calling
`JwtService.verifyAsync` directly, not a `passport-jwt` strategy behind
`@nestjs/passport`.

**Why:** Passport's value is coordinating multiple, swappable
authentication strategies behind one interface. This system has exactly
one — bearer JWT — so the strategy abstraction has no second
implementation to justify its existence yet. If a second scheme is added
later (API keys, OAuth), that's the point at which the abstraction earns
its cost, not before. Full reasoning in
[Authentication Flow](./authentication-flow.md).

## Refresh tokens hashed with SHA-256, not bcrypt

**Decision:** stored refresh-token hashes use SHA-256 with
constant-time comparison; bcrypt is reserved for user passwords.

**Why:** this was caught during implementation, not planned upfront —
bcrypt truncates input at 72 bytes, which a JWT exceeds, and its slow,
salted design defends low-entropy human passwords against brute force, a
property a long random token doesn't need. Using bcrypt here would have
silently truncated every stored hash to the token's first 72 bytes. Full
reasoning in [Authentication Flow](./authentication-flow.md#refresh-and-rotation).

## Every issued token carries a random jti

**Decision:** `JwtPayload` includes `jti` (a random UUID), generated
fresh for every token, including when access and refresh tokens are
issued in the same call.

**Why:** JWT signing is deterministic — two tokens with identical claims,
issued within the same second (`iat`/`exp` share one-second resolution),
would be byte-for-byte identical. This was caught by an end-to-end test
of refresh rotation: reusing a just-rotated-out refresh token
incorrectly succeeded, because the "old" and "new" tokens were the same
string. `jti` guarantees every token is distinct regardless of timing.

## No self-service registration endpoint yet

**Decision:** this milestone implements login, refresh, and logout
against an existing `User` row (populated by a seed script), not
signup.

**Why:** in this architecture, creating a user is bound to creating or
joining a tenant. Building a standalone registration endpoint now would
either need rebuilding once tenancy lands or would ship a signup flow
that creates tenant-less users — a state the rest of the system isn't
designed to handle. See [Why Multi-Tenancy](../concepts/multi-tenancy.md).

---

# Production Readiness Review

The entries below came out of a dedicated review pass rather than a
feature milestone — each one is either a bug that was found and fixed,
or an existing choice that was deliberately left alone. Both kinds are
recorded here for the same reason: so the next person doesn't have to
rediscover the reasoning.

## Login timing side-channel, fixed

**Decision:** `login()` now runs `bcrypt.compare` unconditionally —
against the user's real hash if they exist, against a fixed decoy hash
if they don't — instead of returning immediately for an unknown email.

**Why:** bcrypt is deliberately slow (~100ms at cost factor 12). Skipping
it for unknown emails made "no such user" measurably faster than "wrong
password," which is a timing oracle for enumerating registered emails.
Paying the bcrypt cost on both paths closes that gap. Covered by a
regression test in `auth.service.spec.ts` that asserts `compare` is
always called, so this can't silently regress.

## JWT expiry values validated for format, not just presence

**Decision:** `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` must
match `^\d+[smhd]$` (e.g. `15m`, `7d`), enforced by Joi at boot.

**Why:** the previous schema only required a string. A value like
`"3600"` (a bare number, no unit) would have passed validation at
startup but thrown when `@nestjs/jwt`'s underlying `ms` library tried to
parse it during the *first* login — turning a configuration typo into a
production incident instead of a boot-time failure. Fail fast at the
point where the mistake is cheap to catch.

The first version of this fix shipped a real bug of its own, caught only
by actually booting the app rather than by the type checker: Joi's
`.message()` must directly follow the rule it labels, so chaining
`.pattern(...).default(...).message(...)` attached the message to
`.default()` instead of `.pattern()` and crashed at import time with an
unrelated-looking `@hapi/hoek` assertion error. Correct order is
`.pattern(...).message(...).default(...)`. Verified by validating both a
well-formed and a malformed env object directly against the schema.

## Unit tests introduced, starting with AuthService

**Decision:** added `auth.service.spec.ts` — the first test file in the
repository, despite Jest being configured since the foundation
milestone.

**Why:** authentication is the highest-consequence code in the system to
get subtly wrong, and it's exactly the kind of logic (rotation,
replay-rejection, timing behavior) that's easy to break silently during
a later refactor without a test catching it. This isn't a claim of full
coverage — the rest of the codebase (Prisma/Redis services, the
exception filter, health indicators) still has none. That's recorded
honestly under Remaining Risks rather than implied to be covered.

## Refresh tokens: PostgreSQL, not Redis

**Decision:** kept as-is — `refreshTokenHash` remains a column on `User`
in Postgres. No change made.

**Why this was the right call for where the project is:** a refresh
token's job here is simple — one active session per user, checked
roughly once per refresh (every few minutes to hours, not per-request).
That access pattern doesn't need Redis's latency profile, and Postgres
already gives durability (a server restart doesn't silently log
everyone out) and transactional consistency with the `User` row itself
for free — rotating the hash is one `UPDATE` in the same store that
already owns the user.

**Where this stops being the right call:** the moment the platform needs
per-request revocation checks (a denylist of revoked access tokens,
checked on every authenticated call — see
[Future Improvements](../future-improvements.md#immediate-access-token-revocation)),
Postgres's per-query latency becomes the wrong tool for a check that
now sits on every request's hot path. That's a Redis job. Multi-device
sessions (multiple concurrent refresh tokens per user, "log out
everywhere") would also push toward a Redis-backed session set, since
that's a different data shape (a set of active sessions per user) than
a single nullable column.

**Postgres vs Redis for this specific job:**

| | Postgres (current) | Redis |
|---|---|---|
| Durability | Survives restarts by default | Requires AOF/RDB tuning to match |
| Consistency with `User` row | Same transaction, same store | Separate store, no cross-store transaction |
| Per-request latency | Fine at current call frequency (per-refresh, not per-request) | Better, but not needed yet |
| Natural expiry | Manual (`updatedAt` + application logic) | Native `TTL` |
| Multi-session support | Needs a schema change (a table, not a column) | Natural fit (a set per user) |

Redis wins on latency and native TTL; Postgres wins on durability and
transactional consistency with the row it's revoking. At current scale
— one session per user, checked infrequently — durability and
transactional consistency matter more than shaving milliseconds off an
operation that already isn't on the hot path. This would be worth
revisiting the moment either the access pattern changes (per-request
checks) or the data shape changes (multiple sessions per user).

## Docker introduced now, not earlier

**Decision:** `docker-compose.yml` (Postgres + Redis, dev-only) added in
this review pass, not in Milestone 1 or 2.

**Why it waited:** at the foundation milestone, there was no database or
cache to run — introducing Docker then would have meant shipping
infrastructure with nothing depending on it yet. It became genuinely
useful starting at the infrastructure milestone (Prisma/Redis
integration), which is when local Postgres/Redis were first actually
needed to run the app at all.

**Why this review is the right point to add it, if it wasn't added
already:** a production-readiness pass is precisely where "can a new
contributor clone this and get a working local environment in one
command" gets checked. `docker compose up -d` followed by `npm install`
and `npm run dev:backend` is now the complete path from clone to
running server.

**Scope, deliberately:** only Postgres and Redis are containerized. The
backend and frontend run natively for fast reload during development —
containerizing them isn't ruled out later (a production Dockerfile is a
reasonable next step once there's a deployment target to build one for),
but nothing in local development needs it yet, and adding it now would
be infrastructure without a consumer, the same reasoning that delayed
Docker itself until it had one.

## Repository layout: flat `backend/` `frontend/` `docs/`, not `apps/*`

**Decision:** kept as-is — the repository is a flat layout, not a
nested `apps/*` monorepo structure.

**Why this is the right call for two applications:** `apps/*` earns its
complexity when there are enough deployable units, or enough shared
internal packages between them, that a dedicated `packages/` directory
and cross-package tooling (Turborepo, Nx) pay for themselves. This
repository has exactly two applications that don't share code with each
other — the backend exposes a REST API, the frontend consumes it over
HTTP. There's no shared package that would live in a `packages/`
directory, so the nested layout would add a directory level and
`apps/`-prefixed paths throughout configs, docs, and CI without a single
concrete benefit. npm workspaces already gives both apps independent
`package.json`s, independent dependency trees, and single-root-install
convenience — the entire benefit `apps/*` would add, without the extra
nesting.

**When this would stop being the right call:** a third deployable unit
(a worker service, an admin CLI) or a genuinely shared package (a types
package imported by both backend and frontend) would be the trigger to
introduce `packages/` — not before. Restructuring now, speculatively,
would be exactly the kind of complexity this project's own instructions
have consistently guarded against.

---

# Multi-Tenant Infrastructure

## Tenant context via AsyncLocalStorage with `enterWith`, not `run`

**Decision:** `TenantContextService` wraps a Node `AsyncLocalStorage` and
is entered via `enterWith(store)` from `TenantContextInterceptor`, not
`run(store, callback)`.

**Why:** `run()` only keeps its context active for the synchronous
execution of the callback passed to it. An interceptor's `next.handle()`
returns an *unsubscribed* RxJS Observable — the code that actually needs
the tenant context (the controller, the service, the Prisma call) runs
later, once Nest subscribes to it, outside that synchronous window.
`enterWith` sets the context for the rest of the current execution
chain, including everything scheduled afterward — which is what's
needed here. This was validated empirically before being wired into
Nest at all: a standalone script confirmed context correctly survives
multiple async hops (macrotask, microtask, real I/O) and stays isolated
across concurrent, interleaved "requests" with no leakage between them.

## Tenant resolution is an Interceptor, not literal Nest middleware

**Decision:** the component that reads `tenantId` and establishes the
tenant context (`TenantContextInterceptor`) is a NestJS Interceptor, not
an implementation of `NestMiddleware`.

**Why:** the original architecture diagram called this step "Tenant
Middleware," but Nest's pipeline order is fixed —
Middleware → Guards → Interceptors — and Nest's literal middleware layer
always runs *before* guards. Tenant resolution needs `request.user`,
which `JwtAuthGuard` only attaches once it has verified the token, so
implementing this as real middleware was never actually compatible with
"tenant comes from a verified JWT claim." An interceptor was also chosen
over a second guard for a robustness reason, not just a phase-ordering
one: Nest guarantees *all* guards finish before *any* interceptor runs,
regardless of registration order, whereas two guards run in whatever
order their `APP_GUARD` providers happen to be registered — order that's
one accidental module-import reshuffle away from silently breaking. Full
reasoning in [Request Lifecycle](./request-lifecycle.md).

## Automatic tenant filtering via Prisma Client Extensions

**Decision:** tenant scoping is implemented as a Prisma
[Client Extension](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
(`$extends`) that merges `tenantId` into `where`/`data` automatically,
rather than Prisma's older, now-deprecated `$use` middleware API, and
rather than a manual convention of "remember to pass tenantId."

**Why:** Client Extensions are Prisma's current, actively-maintained
mechanism for exactly this pattern (their own docs use row-level
multi-tenancy as the flagship example). Making scoping automatic instead
of conventional is the actual point — see
[Tenant Isolation](./tenant-isolation.md#why-this-is-enforceable-not-just-a-convention)
for why a convention isn't a strong enough guarantee on its own. The
extension's core logic is deliberately kept in plain, Prisma-independent
functions (`tenant-scoping.util.ts`) rather than written inline inside
the `$extends` call, specifically so it can be unit tested without any
Prisma machinery involved — 9 tests cover it directly.

## `findUnique` is scoped in place, not rewritten to `findFirst`

**Decision:** the extension merges `tenantId` directly into `findUnique`'s
`where` clause rather than converting tenant-scoped `findUnique` calls
into `findFirst`.

**Why:** it's tempting to assume `findUnique` can only filter by a
model's actual unique fields, which would force a rewrite to `findFirst`
to add `tenantId`. Prisma's "extended where unique input" (stable since
Prisma 4.x) already supports combining a unique field with additional
non-unique filters in `findUnique`, which is exactly this case. Verified
directly against Postgres rather than taken on faith: two tenants were
seeded with distinct users, and calling `findUnique` for a real `id`
belonging to the *other* tenant returned `null`, not that tenant's row.

## Login stays on the raw Prisma client, deliberately

**Decision:** `UsersService.findByEmail` (used by login) continues using
the plain `PrismaService`, not `TenantPrismaService` — unchanged from
before this milestone.

**Why:** there is no tenant context at login time — no JWT exists yet to
derive one from. Email is globally unique across the platform (a
property of the schema, not a workaround), so an unscoped lookup by email
is unambiguous and correct; it isn't a hole in the isolation model, it's
the one call site where scoping doesn't apply. Widening
`TenantPrismaService` to somehow "work" without context would be worse —
it would either silently fall back to unscoped queries for every caller
who forgets to check, or require every caller to think about a fail path
that's actually a non-issue outside of login. Keeping the exception
narrow and explicit, at the one real call site, is safer than making the
common path account for it. Verified directly: the raw client sees rows
across all seeded tenants, confirming the extension only affects the
client it's actually applied to.

## Fail closed on missing tenant context

**Decision:** both the interceptor (missing `tenantId` on an
authenticated request) and the Prisma extension (a tenant-scoped query
run with no active context) throw rather than degrade to an unscoped or
empty result.

**Why:** every other failure mode in this chain has a safe default —
missing auth fails the request, missing role will fail the request once
RBAC exists. Tenant scoping is the one place where a "safe-seeming"
fallback (return nothing, or return everything) is actually the
dangerous option: returning everything is a cross-tenant leak, and
silently returning nothing hides a real bug behind what looks like
correct empty-state behavior. Throwing loudly is the only fallback that
doesn't disguise the failure as something else. Verified with two live
HTTP requests: a validly-signed token missing only the `tenantId` claim
was rejected with 403 by the interceptor, and a direct call against the
Prisma extension with no context active threw the same way.

---

# Role-Based Authorization

## Two roles, hierarchy expressed by composition

**Decision:** `Role` is `TENANT_ADMIN` or `MEMBER`. `ROLE_PERMISSIONS`
gives `TENANT_ADMIN` explicit access to `MEMBER`'s full permission list
plus its own admin-only ones, rather than a numeric role-level system
with inheritance logic.

**Why:** with two roles, "does a higher level inherit a lower level's
permissions" has exactly one instance to handle, and writing it out as
`[...MEMBER_PERMISSIONS, ...ADMIN_ONLY_PERMISSIONS]` says the same thing
a level-comparison abstraction would, with less to understand and no
generic machinery sitting unused until (if ever) a third role shows up.
A `PLATFORM_ADMIN` role — hinted at in the original architecture's
frontend dashboards but not built here — would need cross-tenant access
that the current schema doesn't model (every `User` belongs to exactly
one tenant); introducing it is a schema decision for a later milestone,
not something to half-anticipate now by over-building the role system
ahead of it.

## Permissions defined ahead of their endpoints

**Decision:** `Permission` includes `url:*` and `analytics:*` entries
despite no URL or analytics endpoints existing yet.

**Why:** this is the same call made for the Prisma tenant-scoping
extension before any tenant-scoped model besides `User` existed —
building the vocabulary a future milestone will consume, without
building the endpoints that consume it. The alternative — defining
permissions only for what exists today (`user:*`, `tenant:*`) — would
mean the URL milestone starts by inventing permission names ad hoc
instead of decorating routes with ones that already fit the pattern
established here.

## AuthorizationGuard runs before TenantContextInterceptor

**Decision:** the RBAC check happens in the Guards phase (alongside
`JwtAuthGuard`), which necessarily means it completes before
`TenantContextInterceptor` (an Interceptor) ever runs — the reverse of
the sequence implied by the original architecture diagram.

**Why this doesn't violate the diagram's actual intent:** the reasoning
behind "tenant before role" was that a role should be evaluated within
the tenant it applies to. That's still true here — it's just satisfied
by where `role` and `tenantId` come from (the same `User` row, resolved
together at login, embedded in the same token) rather than by which
runtime step executes first. `AuthorizationGuard` never needs to ask
"which tenant" separately from the role it's checking; the two were never
separable in the data to begin with. Full reasoning in
[Request Lifecycle](./request-lifecycle.md).

## Authorization is a Guard; tenant context is an Interceptor — deliberately different

**Decision:** despite both needing only `request.user`, `AuthorizationGuard`
is a Guard and `TenantContextInterceptor` is an Interceptor, not the same
kind of component.

**Why:** authorization (should this request be allowed to proceed) is
Nest's own textbook use case for a Guard. Tenant context establishment
(make a value available to everything downstream) benefited from an
interceptor's stronger ordering guarantee — interceptors are guaranteed
to run after *all* guards regardless of registration order, which is
what let tenant context avoid depending on module import order at all.
`AuthorizationGuard` couldn't get that same guarantee no matter which
component type it used, because its dependency (`JwtAuthGuard` must run
first) is a dependency on another guard specifically, and there's no
Nest-enforced ordering between two guards beyond registration order.
Given that, the choice came down to "which component type is this
concern actually for," and a rejection decision is a Guard's job.

## Guard-to-guard ordering: accepted, not engineered away

**Decision:** `AuthModule` is imported before `AuthorizationModule` in
`AppModule`. This ordering is required for `AuthorizationGuard` to see
`request.user`, and it is *not* independently guaranteed by Nest the way
guards-before-interceptors is.

**Why this wasn't solved instead of documented:** the tenant-context
milestone specifically avoided this exact fragility by using an
interceptor. That option isn't available here — authorization is
correctly a Guard, and a Guard cannot get an ordering guarantee relative
to another Guard beyond registration order. `AuthorizationGuard` narrows
the blast radius instead: a route past `@Public()` with no `request.user`
present throws immediately, with a message naming the ordering assumption
that broke — a loud failure on first use, not a silent authorization
bypass. Verified live: a request with no bearer token at all against a
role-gated route returned 401 (from `JwtAuthGuard`, correctly rejecting
before authorization is even reached), not a false 403 or an
unauthorized 200.

## Verified with a disposable controller, not shipped

**Decision:** the full RBAC chain — role-gated route, permission-gated
route, an unrestricted-but-authenticated route, and a no-token request —
was exercised over real HTTP against a temporary controller
(`ScratchModule`) wired into `AppModule` only for the duration of
verification, then deleted before this repository state was packaged.

**Why:** this milestone's own instructions excluded business endpoints,
so there's no real route yet to prove the guard against. Unit tests
(mocked `ExecutionContext`) cover the guard's logic, but a mocked context
can't prove Nest's actual guard-registration order resolves the way this
document claims. A real, disposable endpoint could. Two real bugs were
caught this way that unit tests alone would have missed entirely: the
seed script's `upsert` used `update: {}`, which meant a pre-existing dev
user's role was never actually updated to `TENANT_ADMIN` on a re-seed —
a real bug in the shipped seed script, now fixed — surfaced only because
an admin-gated route was denying the admin, over real HTTP, against real
seeded data.

---

# URL Management

Full design reasoning for this module — endpoints, short-code strategy,
soft delete, ownership authorization, search/pagination — lives in
[URL Management](./url-management.md), not duplicated here. What follows
are the decisions worth recording as decisions specifically: things that
could plausibly have gone a different way, and why they didn't.

## The tenant-scoping extension was factored into a shared builder

**Decision:** the Prisma extension's per-model interceptors
(`findUnique`, `create`, etc.) are now built once by a shared
`scopedModelOperations()` function and applied to both `user` and `url`,
rather than the two models each getting their own hand-written block.

**Why now and not sooner:** the tenant-isolation milestone that
introduced this extension deliberately left it single-model, with a
comment saying the next tenant-scoped model should copy the pattern, not
generalize ahead of having a second real case to generalize from. `url`
is that second case. The shared builder is intentionally more loosely
typed (`Record<string, unknown>` args) than Prisma's usual
per-operation-inferred extension typing — a real trade against precision,
made because the runtime logic is identical across models and writing it
twice added no safety, only repetition.

## Short codes: attempt-then-catch, not check-then-insert

**Decision:** creating a URL attempts an insert with a candidate code and
only retries on a unique-constraint failure; there's no separate
existence check beforehand.

**Why:** a check-then-insert approach has a race window — two concurrent
requests could both see a code as available before either has inserted
it. Attempt-then-catch has no such window, because the database's unique
constraint is the only authority on collision, checked atomically by the
insert itself. This required teaching the local verification stub to
translate a raw Postgres unique-violation (`23505`) into a
Prisma-shaped error (`P2002`) so the collision-handling code path — which
depends on recognizing that specific error shape — could be genuinely
exercised rather than assumed correct.

## Soft delete over hard delete

**Decision:** `DELETE /urls/:id` sets `deletedAt`; no code path in this
module issues a real `DELETE` against the `urls` table.

**Why:** a URL shortener's delete operation is unusual among CRUD
resources in that the resource has already been handed out and used
before someone might delete it — a hard delete of a link already printed
on a poster or embedded in a sent email is unrecoverable in a way that
matters more here than for, say, deleting a draft document. One nullable
timestamp column is a small price for that link to be recoverable, or at
least auditable, rather than gone.

## Repository layer considered, not introduced

**Decision:** `UrlService` calls `TenantPrismaService` directly — no
`UrlRepository` class exists.

**Why:** the milestone's instructions explicitly left this open
("repository layer if appropriate"). `TenantPrismaService` already is
the centralized, tenant-aware data-access boundary; a repository between
it and `UrlService` would be a second abstraction layer for the same
job, and would make this module inconsistent with `UsersService`, the
only other precedent in the codebase, which also calls
`TenantPrismaService`/`PrismaService` directly. Full reasoning in
[URL Management](./url-management.md#repository-layer-not-introduced).

## A stub-fidelity gap this milestone surfaced: `undefined` vs omitted fields

**Decision:** no source code change — this was a bug in the local
verification stub, not in the shipped module. Recorded here because the
underlying Prisma behavior it exposed is worth every future contributor
knowing.

**What happened:** `PATCH /urls/:id` with only `{ title: "..." }` failed
with a `NOT NULL` constraint violation on `originalUrl` — a column the
request never mentioned. The cause: this project's TypeScript target
(ES2022) defines class fields via `useDefineForClassFields`, which means
an untouched optional DTO property (`originalUrl?: string`) is still an
*own property* on the instance, explicitly set to `undefined` — not
simply absent. Real Prisma treats an `undefined`-valued key in `data` as
"don't touch this field," distinct from `null`, which means "set it to
NULL." The verification stub didn't replicate that distinction; it
treated every own key the same and let the driver bind `undefined` as
SQL `NULL`. Fixed in the stub (filtering `undefined`-valued keys before
building SQL) — `UrlService`'s actual code, `data: { ...dto }`, was
already correct against real Prisma's documented behavior the whole
time. Verified after the fix: a partial update now leaves untouched
fields genuinely untouched.
