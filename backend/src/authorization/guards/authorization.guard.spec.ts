import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthorizationGuard } from './authorization.guard';
import { Permission } from '../permission.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import type { Reflector } from '@nestjs/core';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

describe('AuthorizationGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: AuthorizationGuard;
  let metadata: Record<string, unknown>;

  function buildContext(user?: JwtPayload): ExecutionContext {
    return {
      getType: () => 'http',
      getHandler: () => ({}) as never,
      getClass: () => ({}) as never,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  const user: JwtPayload = {
    sub: 'user-1',
    email: 'dev@example.com',
    tenantId: 'tenant-1',
    role: Role.MEMBER,
    jti: 'jti-1',
  };

  beforeEach(() => {
    metadata = {};
    reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key]),
    } as unknown as jest.Mocked<Reflector>;
    guard = new AuthorizationGuard(reflector);
  });

  it('allows a public route through without checking the user at all', () => {
    metadata[IS_PUBLIC_KEY] = true;
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows an authenticated user through when no role or permission is required', () => {
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    metadata[ROLES_KEY] = [Role.MEMBER];
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('rejects a user whose role is not in the required list', () => {
    metadata[ROLES_KEY] = [Role.TENANT_ADMIN];
    expect(() => guard.canActivate(buildContext(user))).toThrow(ForbiddenException);
  });

  it('allows a user who has every required permission', () => {
    metadata[PERMISSIONS_KEY] = [Permission.URL_READ, Permission.URL_CREATE];
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('rejects a user missing even one required permission', () => {
    metadata[PERMISSIONS_KEY] = [Permission.URL_READ, Permission.USER_MANAGE];
    expect(() => guard.canActivate(buildContext(user))).toThrow(ForbiddenException);
  });

  it('a TENANT_ADMIN passes checks a MEMBER would fail, via the same permission set', () => {
    metadata[PERMISSIONS_KEY] = [Permission.USER_MANAGE];
    const admin: JwtPayload = { ...user, role: Role.TENANT_ADMIN };
    expect(guard.canActivate(buildContext(admin))).toBe(true);
  });

  it('throws a configuration error rather than silently passing if user is missing on a restricted route', () => {
    metadata[ROLES_KEY] = [Role.MEMBER];
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      /AuthorizationGuard ran before authentication/,
    );
  });
});
