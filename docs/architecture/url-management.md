# URL Management

This covers the authenticated CRUD API for managing short links —
`POST/GET/PATCH/DELETE /urls`. It does not cover the public redirect
endpoint (`GET /:shortCode`), which doesn't exist yet — see
[Redirect Flow](./redirect-flow.md) for that design. This page is about
creating and administering links, not following them.

## Endpoints

| Method | Path         | Permission required | Notes |
|--------|--------------|----------------------|-------|
| POST   | `/urls`      | `url:create`         | Auto-generates a code, or accepts a custom one |
| GET    | `/urls`      | `url:read`            | Paginated, optional search |
| GET    | `/urls/:id`  | `url:read`            | |
| PATCH  | `/urls/:id`  | `url:manage_own`      | Ownership checked in the service — see below |
| DELETE | `/urls/:id`  | `url:manage_own`      | Soft delete |

Every route requires authentication (no `@Public()`); there's no
unauthenticated access to this API at all, unlike the future redirect
endpoint.

## Short codes

Codes are 7 characters, alphanumeric only (not nanoid's default alphabet,
which includes `-` and `_` — fine in a URL path, but ugly in a shared
link). A code must be **globally** unique, not just unique within a
tenant — the future redirect endpoint (`GET /:shortCode`) is
unauthenticated and has no tenant context to disambiguate two tenants
picking the same code, so the uniqueness constraint has to be
tenant-independent from day one, even though nothing reads it that way
yet.

**Generation is attempt-then-catch, not check-then-insert.** Creating a
url tries an insert with a random candidate and only generates a new one
if that insert fails on the unique constraint — there's no separate
"does this code exist" query first. A check-then-insert approach leaves a
race window between the check and the insert where two concurrent
requests could both see the code as free; attempt-then-catch doesn't have
that window, because the database's own constraint is the only thing that
decides collision, atomically. Custom codes use the same mechanism: an
attempted create that collides is reported as `409 Conflict` instead of
retried.

## Soft delete

`DELETE` sets `deletedAt` rather than removing the row. Every other
operation — list, get, update — treats a row with `deletedAt` set as
not existing. This is a deliberate choice for a resource with a public
surface: a link that's already been shared can't be un-shared by
deleting the database row, and an accidental hard delete of a live
marketing link is unrecoverable in a way that matters more for a short
link than for most resources. The column costs one nullable timestamp;
recovery — or an eventual purge job — stays possible because the data
is still there.

## Ownership-based authorization

`url:manage_own` is a permission every role has (see
[Role-Based Authorization](./decisions.md)), so the route-level
`@RequirePermissions()` check alone doesn't answer "does this specific
caller own this specific url" — that's resource-specific, and the route
metadata has no way to know it. The actual check happens in
`UrlService`, after the url has been fetched: the caller may proceed if
they created the row (`createdById` matches their `sub`) *or* they hold
`url:manage_own`'s tenant-admin-only sibling, `url:manage` (which grants
managing any url in the tenant, not just one's own). This is the same
`hasPermission()` utility the route guard uses, called directly from
service code — exactly the reuse `authorization.util.ts` was built for
back when only the guard consumed it.

## Search and pagination

Search is a single query parameter matched, case-insensitively, against
`title`, `originalUrl`, and `shortCode` — a client can't tell which field
matched, but doesn't need to; it's meant for "find the link I'm thinking
of," not structured filtering. Pagination is offset-based (`page`,
`limit`, capped at 100) rather than cursor-based — simpler, and
sufficient at the scale a single tenant's link list operates at. Cursor
pagination solves a problem (stable results under concurrent
inserts/deletes at high page depth) this doesn't have yet.

## Repository layer: not introduced

The milestone that added this module explicitly left the choice open
("repository layer if appropriate"). `UrlService` calls
`TenantPrismaService` directly, the same pattern `UsersService` already
uses — no separate repository class sits between them. `TenantPrismaService`
already *is* the centralized, tenant-aware data-access layer; inserting
another layer between it and the service it exists to serve would be
abstraction over abstraction without a concrete benefit, and would break
consistency with the one other service in the codebase that also talks to
Prisma directly. This isn't a blanket rule against ever adding one — a
repository earns its place when query construction gets complex enough
that isolating it from business logic (or mocking it in tests) becomes
genuinely easier than mocking `TenantPrismaService` directly, which
hasn't been true so far.

## Tenant isolation

Every operation here goes through `TenantPrismaService`, which the
tenant-scoping Prisma extension automatically filters by the caller's
tenant — see [Tenant Isolation](./tenant-isolation.md). This module is
the second real consumer of that mechanism (`user` was the first), which
is what prompted factoring the extension's per-model operations into a
shared builder instead of writing the same ten handlers twice — see
[Design Decisions](./decisions.md).
