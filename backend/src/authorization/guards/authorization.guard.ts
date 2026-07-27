import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { hasAllPermissions, hasRole } from '../authorization.util';
import type { Permission } from '../permission.enum';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { Role } from '@prisma/client';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() or @RequirePermissions() on this route: any authenticated
    // user may proceed, same default posture as @Public() has for
    // authentication — a route only restricts access if it explicitly
    // opts in to a requirement.
    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const { user } = request;

    // JwtAuthGuard runs before any other guard (both are Guards, and this
    // one is registered after AuthModule's in AppModule specifically so
    // request.user is always populated here on a non-public route). See
    // docs/architecture/decisions.md if this guard is ever reordered.
    if (!user) {
      throw new Error(
        'AuthorizationGuard ran before authentication — check guard registration order',
      );
    }

    if (requiredRoles?.length && !hasRole(user.role, requiredRoles)) {
      throw new ForbiddenException('Your role does not permit this action');
    }

    if (requiredPermissions?.length && !hasAllPermissions(user.role, requiredPermissions)) {
      throw new ForbiddenException('Your role does not grant a required permission');
    }

    return true;
  }
}
