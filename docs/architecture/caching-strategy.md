# Caching Strategy

Redis serves three distinct purposes in this system. They're described
separately because they have different consistency requirements and
different failure tolerances.

## URL redirect cache

**Pattern:** cache-aside, keyed by short code.

**Read path:** check Redis; on miss, read Postgres and populate Redis; on
hit, skip Postgres entirely.

**Invalidation:** a link's cached entry must be invalidated the moment the
link is edited or deleted — otherwise a visitor keeps landing on the old
destination, or on a deleted link, until the entry naturally expires. The
service layer that performs an edit or delete is responsible for
invalidating the corresponding cache key as part of that same operation,
not as a background afterthought. This is the one place in the caching
design where correctness matters more than latency — a stale redirect is
a visible product bug, not a minor inconsistency.

**Failure tolerance:** if Redis is unavailable, the redirect path falls
back to Postgres directly. Slower, but correct. The cache is an
optimization, never a dependency the redirect path requires to function.

## Rate limiting

**Pattern:** fixed or sliding window counters, keyed by client identifier
(IP for the public redirect path, tenant/user for authenticated routes).

**Why Redis and not in-memory counters:** the backend is expected to run
as more than one instance behind a load balancer. In-memory counters would
let a client bypass limits simply by landing on a different instance.
Redis gives every instance a shared view of request counts.

**Failure tolerance:** rate limiting is a protection mechanism, not a
correctness requirement. If Redis is briefly unavailable, the system
should fail open (allow requests) rather than fail closed (reject
everything) — an outage in the cache layer should degrade protection, not
take down the product.

## Session / token cache

Used for token blacklisting and session-adjacent lookups where checking
Postgres on every authenticated request would be wasteful. Same failure
posture as the redirect cache: Redis is an accelerant on top of a system
that remains correct without it.

## What Redis is never used for

Redis never holds data that only exists in Redis. Every key is either
derived from Postgres (redirect cache, session cache) or is inherently
ephemeral by design (rate-limit counters). This is what makes Redis safe
to flush, restart, or lose without a data-recovery story.
