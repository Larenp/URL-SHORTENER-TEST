# Tenant Isolation

This is the guarantee the entire platform is built around: one tenant's
data is never visible to another, despite every tenant sharing the same
application instance, database, and cache.

## The mechanism

Every tenant-owned table (`users` today; `urls` and click analytics will
follow the same pattern) carries a `tenantId` column, indexed for query
performance. Every query against a tenant-owned table is scoped by it:

```sql
SELECT * FROM users WHERE "tenantId" = $1
```

The filter value is never accepted from client input. It's resolved once
per request — from the caller's verified JWT `tenantId` claim (see
[Authentication Flow](./authentication-flow.md)) — and made available to
the data-access layer through a request-scoped context, not threaded
through method signatures by hand.

## How tenantId reaches a query, concretely

1. **`JwtAuthGuard`** verifies the access token and attaches the decoded
   payload — including `tenantId` — to `request.user`.
2. **`TenantContextInterceptor`** runs immediately after (Nest guarantees
   all guards complete before any interceptor runs, regardless of how
   many guards or interceptors are registered or in what order — this is
   a hard pipeline-phase guarantee, not a registration-order convention).
   It reads `request.user.tenantId` and calls
   `TenantContextService.enterWith({ tenantId, userId })`, which stores it
   in a Node `AsyncLocalStorage`. From this point on, every `await` in the
   request's call chain — the controller, the service, the Prisma call —
   can read it back without it being passed as an argument anywhere.
3. **`TenantPrismaService`** wraps the base Prisma client in a
   [Client Extension](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
   that reads `TenantContextService.getTenantId()` at query time and
   merges it into the query — `where` for reads/updates/deletes, `data`
   for creates — before the query reaches Postgres. A caller using
   `TenantPrismaService` cannot construct a query that omits the tenant
   filter, because the filter isn't something the caller writes at all.

## Why this is enforceable, not just a convention

The risk with "always filter by tenantId" as a rule is that it depends on
every developer remembering it at every call site — a single missed
`where` clause is a cross-tenant data leak. Centralizing tenant scoping in
a Prisma Client Extension removes that dependency: a service that injects
`TenantPrismaService` gets a client whose `user.findMany()`,
`user.update()`, `user.create()`, and so on are already scoped, with no
extra argument to remember and no way to opt out short of reaching for
the raw client explicitly (see "The one legitimate exception" below).

**`findUnique` deserves a specific note.** Prisma normally restricts a
`findUnique` `where` clause to a model's actual unique fields (`id` or
`email` here) — you can't naively add an arbitrary extra filter. Rather
than rewrite every `findUnique` call into `findFirst` to work around that,
this extension relies on Prisma's *extended where unique input* (stable
since Prisma 4.x): a `findUnique` `where` can combine a unique field with
additional non-unique filters, and Postgres just ANDs them together. So
`user.findUnique({ where: { id } })` becomes
`where: { id, tenantId }` under the hood — a real `id` belonging to a
different tenant correctly returns `null`, not the other tenant's row.
This was verified directly against Postgres, not just read from Prisma's
docs: seeding two tenants with distinct users and calling `findUnique` by
another tenant's real `id` returns `null`, exactly as required.

## The one legitimate exception: login

`AuthService.login()` looks up a user by email *before* any tenant
context exists — there's no JWT yet at that point, nothing to establish
context from. This is why login uses the plain `PrismaService` (the raw,
unscoped client), not `TenantPrismaService`. This isn't a gap in the
isolation model — email is globally unique across the whole platform (see
the `User` schema), so an unscoped lookup by email is unambiguous and
correct. It's the one call site in the codebase that's deliberately
exempt, and it's exempt because scoping doesn't apply to it, not because
someone forgot.

## Fail-closed by design

If a tenant-scoped query somehow runs with no active tenant context —
which shouldn't happen given the guard/interceptor chain above, but
"shouldn't happen" isn't a safety property — the extension throws a
`ForbiddenException` rather than running the query unscoped. An unscoped
query against a tenant-owned table is never an acceptable fallback; a
loud failure is.

## Worked example

Two tenants share the same database and the same `users` table. A user
authenticated against Tenant A has a JWT carrying that tenant's id. Every
request they make is scoped to it by the mechanism above — regardless of
what the request body or query string contains, they cannot read or
modify rows belonging to Tenant B, because no query executed on their
behalf is ever filtered by anything other than their own token's tenant
claim, and that claim isn't something a client can influence (see
[Authentication Flow](./authentication-flow.md) for why `tenantId` comes
from a signed token rather than a request parameter).

## What this model does not protect against

Row-level filtering protects against cross-tenant data access through the
application's own API. It does not protect against:

- A bug in the tenant-scoping extension or context interceptor
  themselves, which would compromise every tenant simultaneously — this
  is why these are treated as some of the highest-scrutiny code in the
  repository, and why the extension's core logic
  (`tenant-scoping.util.ts`) is kept as small, pure functions specifically
  so it can be tested in isolation from Prisma's own machinery.
- Direct database access outside the application (an operator with raw
  Postgres credentials sees all tenants). This is an infrastructure access
  control concern, not an application-layer one.

## When to move beyond shared-schema isolation

Schema-per-tenant or database-per-tenant becomes worth the added
operational cost when a tenant requires guarantees row-level filtering
can't provide — dedicated performance isolation, tenant-specific
compliance requirements, or contractual data residency. None of those
apply at this platform's current scale; see
[Future Improvements](../future-improvements.md).
