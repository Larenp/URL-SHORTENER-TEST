# Authentication Flow

## Current scope

This page describes authentication as implemented: login, access/refresh
tokens, and session revocation for a `User` that belongs to exactly one
tenant and carries one role. What the guard chain does with `tenantId`
and `role` once they're on the token is covered in
[Request Lifecycle](./request-lifecycle.md), not here — this page is
about how the token itself is issued, verified, and rotated.

## Token issuance

`POST /auth/login` verifies email and password against Postgres (via
`UsersService`) and, on success, issues two JWTs:

- **Access token** — 15 minute lifetime, signed with a dedicated access
  secret. Sent as a bearer token on every subsequent authenticated
  request.
- **Refresh token** — 7 day lifetime, signed with a *separate* secret from
  the access token. Used only to obtain a new token pair.

Both tokens carry `{ sub, email, tenantId, role, jti }` — `sub` is the
user ID, `tenantId` is the user's tenant (see
[Tenant Isolation](./tenant-isolation.md) for why this claim, rather than
a request parameter, is what the entire isolation model depends on),
`role` is what `AuthorizationGuard` checks against `@Roles()` and
`@RequirePermissions()` (see
[Request Lifecycle](./request-lifecycle.md)), and `jti` is a random UUID
unique to that specific token. The `jti` exists so that two tokens issued
in the same second (same `sub`/`email`/`tenantId`/`role`/`iat`/`exp`) are
still cryptographically distinct — without it, JWT signing is
deterministic and two tokens minted in the same wall-clock second would
be byte-for-byte identical, which breaks rotation (see below).

Passwords are hashed with bcrypt (cost factor 12) via a dedicated
`PasswordService`, isolating the hashing scheme from `AuthService` itself.

Login always runs a bcrypt comparison, even when the email doesn't match
any user — against a fixed decoy hash in that case. bcrypt is
deliberately slow, so returning early for an unknown email would make
"no such user" measurably faster than "wrong password," letting an
attacker enumerate registered emails by timing. Paying the bcrypt cost
on both paths removes that signal.

## Token verification

Every authenticated request carries the access token as a bearer token.
`JwtAuthGuard` is registered globally and verifies the token's signature
and expiry before any controller runs. Routes are opted *out* of this
check with `@Public()` (used on `/auth/login`, `/auth/refresh`, and the
health check), rather than opted in — the default is authenticated,
which is the safer failure mode for a route someone forgets to annotate.
An authenticated handler reads the verified payload via `@CurrentUser()`.

The guard is a small hand-rolled `CanActivate` using `JwtService`
directly, not a Passport strategy. With a single token type to verify,
Passport's strategy-registration indirection added a dependency and a
layer of abstraction without a second strategy to justify it.

## Refresh and rotation

`POST /auth/refresh` verifies the refresh token's signature, looks up the
user by its `sub` claim, and compares the token against a hash stored on
that user's row (`refreshTokenHash`). On success, it issues an entirely
new access/refresh pair and **overwrites** the stored hash — the
previous refresh token is no longer valid, even though it hasn't expired.
This is rotation-on-use: a stolen refresh token is only usable until the
legitimate client's next refresh, not for its full 7-day lifetime.

The stored hash uses SHA-256, not bcrypt. Bcrypt silently truncates input
at 72 bytes — shorter than a JWT — and its deliberately slow, salted
design exists to defend low-entropy secrets like human passwords against
brute-force guessing. A refresh token is already a long, random,
high-entropy value; slow hashing adds cost with no corresponding security
benefit. Comparison uses `timingSafeEqual` to avoid leaking hash-match
information through response timing.

## Logout

`POST /auth/logout` (authenticated) clears the stored `refreshTokenHash`
for the calling user. This revokes the refresh session — the access
token already issued remains valid until it naturally expires, which is
the accepted trade-off for keeping this milestone's login/refresh/logout
flow to a single table with no additional cache-backed revocation list.
Immediate access-token revocation is a future improvement — see
[Future Improvements](../future-improvements.md).

## Registration is intentionally still not implemented

There is no self-service signup endpoint yet. Now that `Tenant` exists as
a real model, registration means creating a tenant and its first user
together — that's a business endpoint, and this milestone was
infrastructure only (tenant context, propagation, automatic Prisma
scoping), not endpoints. A seed script (`prisma/seed.ts`) creates one
tenant and one test user for exercising login during development.

## Roles and tenancy are both part of the token now

`tenantId` and `role` are both part of the JWT payload and the `User`
model — see [Tenant Isolation](./tenant-isolation.md) for tenant scoping
and `docs/architecture/decisions.md` for the RBAC design (roles,
permissions, the guard, and why the "Role-Based Authorization Guard"
from the original diagram ended up running *before* the tenant context
interceptor rather than after). Nothing about the auth flow itself
changed to add this — it was exactly the additive change anticipated
when `tenantId` first landed: a new claim on `JwtPayload`, not a
redesign of how tokens are verified or trusted.
