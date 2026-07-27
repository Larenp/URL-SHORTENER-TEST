# Request Lifecycle

This describes the path an authenticated management request takes through
the backend, from arrival to response. The public redirect path is
intentionally different — see [Redirect Flow](./redirect-flow.md).

## Order of execution

```
Request
  → JWT Authentication Guard
  → Authorization Guard (roles / permissions)
  → Tenant Context Interceptor
  → Controller
  → Service
  → Prisma (tenant-scoped)
  → PostgreSQL
```

This is the actual order, not the order originally sketched in the
architecture diagram — see the correction below for why, and why it's
still correct.

## Two corrections from the original architecture

**"Tenant Middleware" is a NestJS Interceptor, not literal middleware.**
Nest's pipeline runs in a fixed phase order — Middleware → Guards →
Interceptors — and Nest's literal middleware layer always runs *before*
guards, with no per-route way to change that. Tenant resolution needs
`request.user.tenantId`, which only exists once `JwtAuthGuard` has
verified the token, so implementing it as real `NestMiddleware` was never
actually compatible with "tenant comes from a verified JWT claim."

**The Authorization Guard runs before the Tenant Context Interceptor, not
after**, even though the original diagram drew tenant resolution first.
This is a direct consequence of the same phase ordering: both
`JwtAuthGuard` and `AuthorizationGuard` are Guards, so both run before any
Interceptor, including `TenantContextInterceptor`. The diagram's original
reasoning — "a role is only meaningful within the tenant it applies to" —
still holds, just not through this component's runtime *sequencing*.
`role` is a column on the same `User` row `tenantId` comes from, resolved
together at login and embedded in the same JWT; by the time
`AuthorizationGuard` reads `request.user.role`, it's already the role for
the correct tenant, because it was never looked up any other way. The
tenant-scoping *of the role itself* happened at token-issuance time, not
at request-authorization time — so `AuthorizationGuard` doesn't need the
request-scoped tenant context (`TenantContextService`) to be active to
check it correctly.

## Why an Interceptor for tenant context, but a Guard for authorization

Both `TenantContextInterceptor` and `AuthorizationGuard` only need
`request.user`, populated by `JwtAuthGuard` — so why is one an Interceptor
and the other a Guard?

**Authorization is textbook Guard territory.** Nest's own documentation
defines a Guard's purpose as deciding whether a request should be handled
at all, based on things like roles and permissions — this is closer to
that canonical case than almost anything else in this codebase, and
`AuthorizationGuard` doesn't need to *establish* anything for later code
to consume, the way tenant context does — it just allows or rejects.

**Tenant context specifically needed the stronger ordering guarantee an
Interceptor gives.** Nest guarantees *all* guards finish before *any*
interceptor runs — a hard pipeline-phase guarantee, independent of how
many guards exist or in what order they're registered. Two guards, by
contrast, run in whatever order their `APP_GUARD` providers were
registered, which depends on module import order in `AppModule`. Since
`TenantContextInterceptor` doesn't actually need to run relative to
`AuthorizationGuard` in any particular order (neither depends on the
other — both only need `JwtAuthGuard` to have already run), keeping it as
an interceptor was strictly safer with no downside. `AuthorizationGuard`,
however, *does* have a real ordering dependency (`JwtAuthGuard` must run
first), which is handled the more fragile way — see the ordering note
below — because that dependency is unavoidable for a Guard-based
authorization check; there's no interceptor-based way to make "did
`JwtAuthGuard` already run" a phase-level guarantee the way
"did all guards already run" is.

## Guard registration order is a real, accepted dependency

`AuthModule` is imported before `AuthorizationModule` in `AppModule`,
specifically because `AuthorizationGuard` reads `request.user`, which
only exists once `JwtAuthGuard` (registered by `AuthModule`) has already
run. Unlike the interceptor-vs-guard phase ordering above, this ordering
is *not* independently enforced by Nest — it follows from module import
order, and would break silently if the imports were reordered.
`AuthorizationGuard` defends against this the same way a misconfigured
route would surface: if `request.user` is missing on a route that isn't
`@Public()`, it throws a plain `Error` (not a normal auth/authz
rejection) — turning a silent ordering regression into an immediate,
loud failure the first time it's exercised, rather than a request that
quietly proceeds unauthorized.

## What each stage does

1. **JWT Authentication Guard** verifies the token's signature and
   expiry, and attaches the decoded payload — `sub`, `email`, `tenantId`,
   `role` — to `request.user`, before any other code executes for that
   request.

2. **Authorization Guard** checks `@Roles()` and `@RequirePermissions()`
   metadata on the route (if any) against `request.user.role`. A route
   with neither decorator allows any authenticated user through — the
   same "restrictions are opt-in" posture `@Public()` has for
   authentication itself. See
   [Authentication Flow](./authentication-flow.md) for how `role` reaches
   the token in the first place.

3. **Tenant Context Interceptor** reads `tenantId` from `request.user`
   and stores it in an `AsyncLocalStorage`-backed context for the rest of
   the request's async call chain. See
   [Tenant Isolation](./tenant-isolation.md) for how this context reaches
   Prisma queries.

4. **Controller → Service → Prisma.** By the time a request reaches
   business logic, identity, role, and tenant are already resolved and
   available without being passed as arguments.

## Why this isn't collapsed into one component

A single combined "auth + role + tenant" component would be simpler to
read at first glance, but it couples three independently-changing
concerns: authentication mechanism, authorization rules, and tenant
resolution strategy. Each has separately evolved in most production
systems — adding a second authentication method (API keys alongside
JWTs) shouldn't require touching role-checking or tenant-resolution
logic. Keeping them separate also means each can be given the pipeline
placement that actually suits it, rather than forcing all three into
whichever placement the most demanding one needs.

## Error handling

Any failure at any stage short-circuits the chain — a request that fails
authentication never reaches the authorization guard or the tenant
interceptor. All guard/interceptor failures and unhandled exceptions are
normalized into a single response shape by the global exception filter,
so API clients handle one error contract regardless of which layer
rejected the request.
