import {
  ForbiddenException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { TenantContextService } from './tenant-context.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const { user } = request;

    // JwtAuthGuard runs before any interceptor (Nest's pipeline is strictly
    // Guards then Interceptors, regardless of provider registration order),
    // so a non-public route reaching here always has a verified user with a
    // tenantId claim. Missing user/tenantId means a route was misconfigured
    // (e.g. marked @Public() but reads request.user), not a client error —
    // fail closed rather than let a tenant-less request through.
    if (!user?.tenantId) {
      throw new ForbiddenException('Request is missing tenant context');
    }

    this.tenantContext.enterWith({ tenantId: user.tenantId, userId: user.sub });

    return next.handle();
  }
}
