import { Prisma } from '@prisma/client';
import type { TenantContextService } from './tenant-context.service';
import {
  requireTenantId,
  scopeCreateData,
  scopeCreateManyData,
  scopeWhere,
} from './tenant-scoping.util';

type QueryFn = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * The full set of tenant-scoped operations for one model. Every
 * tenant-owned model needs the identical set of interceptors — the only
 * thing that differs between `user` and `url` is which model they're
 * attached to, not what they do — so this is built once and reused,
 * rather than repeating ten near-identical handlers per model. The
 * predecessor of this file (single-model, `user` only) deliberately
 * avoided this factoring until a second real case existed; `url` is
 * that case.
 *
 * Loosely typed (`Record<string, unknown>` args, not each model's
 * generated `WhereInput`/`Data` types) is a deliberate trade against
 * Prisma's usual per-callsite type inference for extensions — sharing
 * one function across models means giving up some of that precision.
 * The actual tenant-scoping logic itself (`scopeWhere`, `scopeCreateData`)
 * is fully typed and fully unit tested independent of this file; what's
 * loosely typed here is only the Prisma-specific wiring around it.
 */
function scopedModelOperations(tenantContext: TenantContextService) {
  const tenantId = (): string => requireTenantId(tenantContext.getTenantId());

  const withScopedWhere = (ctx: {
    args: Record<string, unknown>;
    query: QueryFn;
  }): Promise<unknown> =>
    ctx.query({
      ...ctx.args,
      where: scopeWhere(ctx.args.where as Record<string, unknown> | undefined, tenantId()),
    });

  return {
    findUnique: withScopedWhere,
    findFirst: withScopedWhere,
    findMany: withScopedWhere,
    count: withScopedWhere,
    update: withScopedWhere,
    updateMany: withScopedWhere,
    delete: withScopedWhere,
    deleteMany: withScopedWhere,
    create: (ctx: { args: Record<string, unknown>; query: QueryFn }): Promise<unknown> =>
      ctx.query({
        ...ctx.args,
        data: scopeCreateData(ctx.args.data as Record<string, unknown>, tenantId()),
      }),
    createMany: (ctx: { args: Record<string, unknown>; query: QueryFn }): Promise<unknown> =>
      ctx.query({
        ...ctx.args,
        data: scopeCreateManyData(
          ctx.args.data as Record<string, unknown> | Record<string, unknown>[],
          tenantId(),
        ),
      }),
  };
}

/**
 * `findUnique` is included deliberately, not rewritten to `findFirst`:
 * Prisma's "extended where unique input" (stable since Prisma 4.x) allows
 * additional non-unique filters alongside the unique field, so
 * `findUnique({ where: { id, tenantId } })` correctly returns null for a
 * real id belonging to a different tenant rather than requiring a
 * different operation. Verified directly against Postgres for `user` in
 * the tenant-isolation milestone; the same Prisma behavior applies here.
 */
export function tenantScopingExtension(tenantContext: TenantContextService) {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      user: scopedModelOperations(tenantContext),
      url: scopedModelOperations(tenantContext),
    },
  });
}
