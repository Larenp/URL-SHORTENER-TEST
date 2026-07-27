# Future Improvements

Deliberately deferred decisions, and what would justify revisiting them.
None of these are gaps in the current design — they're scope boundaries
chosen for the platform's current stage, documented so the reasoning isn't
lost.

## Analytics at scale

Click events currently live in Postgres alongside operational data. If
click volume or query complexity grows past what a relational table
comfortably serves (high-cardinality time-range aggregation across many
tenants), a dedicated analytics store or a write-side event stream (e.g.
an append-only log feeding periodic aggregation) becomes worth the added
operational surface. Not justified today — see
[Analytics Flow](./architecture/analytics-flow.md).

## Tenant isolation beyond row-level filtering

Shared-schema, `tenantId`-filtered isolation is the right default at
current scale. A tenant with a hard requirement row-level filtering can't
satisfy — dedicated performance isolation, data residency, contractual
audit requirements — would justify schema-per-tenant or
database-per-tenant for that tenant specifically, not a wholesale
migration. See [Tenant Isolation](./architecture/tenant-isolation.md).

## Reverse proxy and edge concerns

TLS termination, request-level rate limiting at the edge, and static asset
delivery for the frontend currently have no dedicated layer in front of
the application. An Nginx (or equivalent) layer belongs here once the
system moves toward a real deployment target, rather than at the
foundation stage where there's no traffic pattern yet to tune it against.

## Asynchronous click recording

Click capture currently happens as a direct write after the redirect
response. A queue-backed write (the redirect handler publishes an event,
a worker persists it) would decouple redirect latency from database write
latency entirely. Worth introducing once redirect volume makes that
coupling measurable, not before.

## Observability beyond structured logs

Structured logging is in place from the foundation stage. Metrics
(request latency, cache hit rate, per-tenant request volume) and
distributed tracing are natural next additions once there are enough
moving parts for a log stream alone to be insufficient for debugging
production issues.

## Multi-region and horizontal scale

Out of scope entirely at this stage. The architecture's use of stateless
application instances behind a shared Postgres/Redis layer is what would
make horizontal scaling (more instances, not bigger ones) straightforward
later, but the current milestone plan does not require reasoning about
it yet.

## Immediate access-token revocation

Logout currently revokes the refresh session (no further token refresh
is possible) but the access token already issued remains valid until it
naturally expires — up to 15 minutes. Closing that window requires a
denylist of revoked access tokens, checked on every request, which is
exactly the kind of low-latency lookup [Caching Strategy](./architecture/caching-strategy.md#session--token-cache)
already earmarks Redis for. Not implemented now because a 15-minute
exposure window on logout is an accepted trade-off at this stage, not a
gap that blocks anything else.
