import { Role } from '@prisma/client';
import { Permission } from './permission.enum';
import {
  getPermissionsForRole,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRole,
} from './authorization.util';

describe('authorization.util', () => {
  describe('hasPermission', () => {
    it('grants MEMBER its own permissions', () => {
      expect(hasPermission(Role.MEMBER, Permission.URL_CREATE)).toBe(true);
    });

    it('denies MEMBER admin-only permissions', () => {
      expect(hasPermission(Role.MEMBER, Permission.USER_MANAGE)).toBe(false);
      expect(hasPermission(Role.MEMBER, Permission.TENANT_MANAGE)).toBe(false);
      expect(hasPermission(Role.MEMBER, Permission.URL_MANAGE)).toBe(false);
    });

    it('grants TENANT_ADMIN its own admin-only permissions', () => {
      expect(hasPermission(Role.TENANT_ADMIN, Permission.USER_MANAGE)).toBe(true);
      expect(hasPermission(Role.TENANT_ADMIN, Permission.TENANT_MANAGE)).toBe(true);
    });

    it('the hierarchy holds: TENANT_ADMIN also has every MEMBER permission', () => {
      for (const permission of getPermissionsForRole(Role.MEMBER)) {
        expect(hasPermission(Role.TENANT_ADMIN, permission)).toBe(true);
      }
    });
  });

  describe('hasAllPermissions', () => {
    it('true when every permission is present', () => {
      expect(hasAllPermissions(Role.MEMBER, [Permission.URL_READ, Permission.URL_CREATE])).toBe(
        true,
      );
    });

    it('false when any permission is missing', () => {
      expect(hasAllPermissions(Role.MEMBER, [Permission.URL_READ, Permission.USER_MANAGE])).toBe(
        false,
      );
    });
  });

  describe('hasAnyPermission', () => {
    it('true when at least one permission is present', () => {
      expect(hasAnyPermission(Role.MEMBER, [Permission.USER_MANAGE, Permission.URL_READ])).toBe(
        true,
      );
    });

    it('false when none are present', () => {
      expect(
        hasAnyPermission(Role.MEMBER, [Permission.USER_MANAGE, Permission.TENANT_MANAGE]),
      ).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('true when the role is in the allowed list', () => {
      expect(hasRole(Role.TENANT_ADMIN, [Role.TENANT_ADMIN])).toBe(true);
    });

    it('false when the role is not in the allowed list', () => {
      expect(hasRole(Role.MEMBER, [Role.TENANT_ADMIN])).toBe(false);
    });

    it('true when multiple roles are allowed and one matches', () => {
      expect(hasRole(Role.MEMBER, [Role.TENANT_ADMIN, Role.MEMBER])).toBe(true);
    });
  });
});
