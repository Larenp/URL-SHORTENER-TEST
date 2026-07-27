import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextStore {
  tenantId: string;
  userId: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  /**
   * Sets the tenant context for the remainder of the current async
   * execution chain. Used by TenantContextInterceptor at the start of a
   * request, after JwtAuthGuard has verified the token — everything the
   * request handler subsequently awaits (services, Prisma calls) inherits
   * this context automatically via Node's async context propagation.
   *
   * Deliberately `enterWith`, not `run`: `run(store, callback)` only keeps
   * the context active for the synchronous execution of `callback`. An
   * interceptor's `next.handle()` returns an unsubscribed Observable —
   * the handler code that actually needs this context runs later, once
   * Nest subscribes to it. `enterWith` sets the context for that entire
   * later continuation instead of just the synchronous call that created it.
   */
  enterWith(store: TenantContextStore): void {
    this.storage.enterWith(store);
  }

  /** Scopes `callback` to `store` and restores the prior context after it settles. Used by tests and by any one-off background work that needs an explicit, bounded tenant context rather than an inherited one. */
  run<T>(store: TenantContextStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  getStore(): TenantContextStore | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }
}
