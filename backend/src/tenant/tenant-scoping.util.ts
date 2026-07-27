import { ForbiddenException } from '@nestjs/common';

/**
 * Throws if no tenant context is active. Every tenant-scoped query must go
 * through this — there is no legitimate way to run a scoped query without a
 * tenant, so a missing context is treated as a bug (fail closed) rather
 * than silently returning unscoped or empty results.
 */
export function requireTenantId(tenantId: string | undefined): string {
  if (!tenantId) {
    throw new ForbiddenException('No active tenant context for a tenant-scoped query');
  }
  return tenantId;
}

/** Merges tenantId into a `where` clause, overriding any client-supplied tenantId — a caller can never widen or override the scope of their own request context. */
export function scopeWhere<W extends Record<string, unknown> | undefined>(
  where: W,
  tenantId: string,
): Record<string, unknown> {
  return { ...(where ?? {}), tenantId };
}

/** Stamps tenantId onto data for a single create, overriding any client-supplied value for the same reason as scopeWhere. */
export function scopeCreateData<D extends Record<string, unknown>>(
  data: D,
  tenantId: string,
): Record<string, unknown> {
  return { ...data, tenantId };
}

/** Same as scopeCreateData, but for createMany's array-or-single-object `data` shape. */
export function scopeCreateManyData<D extends Record<string, unknown>>(
  data: D | D[],
  tenantId: string,
): Record<string, unknown> | Record<string, unknown>[] {
  return Array.isArray(data) ? data.map((item) => ({ ...item, tenantId })) : { ...data, tenantId };
}
