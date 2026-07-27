# Why Multi-Tenancy

## The problem with single-tenant thinking

A single-tenant URL shortener assumes one owner: one set of users, one set
of links, one analytics dashboard. That model breaks the moment the product
needs to serve multiple independent organizations — each with its own users,
its own links, and a hard requirement that none of them can see another's
data. Building a separate deployment per customer solves isolation but not
much else: it multiplies infrastructure cost, makes upgrades a
per-customer rollout problem, and turns a straightforward CRUD system into
an operations burden.

## Traditional approach vs proposed solution

**Traditional approach — database or deployment per tenant.** Every
customer gets an isolated database, sometimes an isolated application
instance. Isolation is airtight, but the operational cost scales linearly
with customer count: N tenants means N databases to migrate, back up, and
monitor.

**Proposed solution — shared infrastructure, logical isolation.** One
application, one database, one Redis instance, serving every tenant. Every
tenant-owned table carries a `tenantId` column, and every query is scoped by
it. Isolation is enforced in code and at the query layer rather than by
physical separation. This is the standard approach used by mainstream B2B
SaaS platforms at small-to-mid scale, because it keeps operational
complexity flat regardless of tenant count, while still giving each tenant
a fully isolated view of their own data.

The trade-off is explicit: isolation now depends on every code path
correctly applying the tenant filter, rather than being guaranteed by
infrastructure. This repository's architecture addresses that by pushing
tenant scoping into a single middleware layer that all requests pass
through, rather than leaving it to individual query authors to remember.

## Core multi-tenant concepts

**Tenant.** An organization using the platform — the billing and isolation
boundary. All users, links, and analytics belong to exactly one tenant.

**Tenant identification.** The tenant a request belongs to is derived from
the authenticated user's JWT, not from a client-supplied parameter. A
client cannot claim to belong to a different tenant by changing a request
field.

**Row-level isolation.** Every tenant-owned table includes `tenantId`.
Every read and write for tenant-owned data is filtered by it. There is no
"global" query path that returns rows across tenants in application code.

**Roles vs tenancy.** Role (what a user is allowed to do) and tenant
(which organization's data they can act on) are independent axes. A
tenant-admin role in Tenant A has no special privilege in Tenant B — they
simply don't have a token that identifies them as belonging to Tenant B at
all.

See [Tenant Isolation](../architecture/tenant-isolation.md) for the
concrete implementation of this pattern and its guarantees.
