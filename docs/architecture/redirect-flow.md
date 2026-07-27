# Redirect Flow

The redirect path is the highest-traffic, most latency-sensitive route in
the system, and the only public (unauthenticated) one. It is deliberately
kept separate from the authenticated guard chain described in
[Request Lifecycle](./request-lifecycle.md).

## Flow

```
Visitor → GET /:shortCode
        → Redis lookup (cache-aside)
            hit  → 302 redirect, click recorded
            miss → PostgreSQL lookup
                   → populate Redis
                   → 302 redirect, click recorded
```

## Why no authentication on this path

The visitor clicking a short link is not a system user — they have no
account, no token, and no relationship with the tenant beyond having
received the link. Requiring authentication here would defeat the purpose
of a shortener. The tenant a link belongs to is resolved from the link
record itself, not from caller identity, so authentication has nothing to
check.

## Why Redis-first instead of Postgres-first

Redirects are read-heavy and latency-sensitive: a visitor waiting on a
redirect notices delay far more than a dashboard user waiting on an
analytics query. Cache-aside (check Redis, fall back to Postgres on miss,
populate Redis after) keeps the common case — a link that's been clicked
before — off the primary database entirely. Postgres is only touched on
first click after creation or after a cache eviction.

## Click recording is not on the critical path

Recording a click (for later analytics) happens after the redirect
response is issued, not before it. A visitor's redirect should never wait
on an analytics write. See [Analytics Flow](./analytics-flow.md) for how
this is decoupled in practice, and [Caching Strategy](./caching-strategy.md)
for how the cache stays consistent when a link is edited or deleted.
