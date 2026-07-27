import type { Role } from '@prisma/client';
import type { Permission } from './permission.enum';
import { ROLE_PERMISSIONS } from './role-permissions';

export function getPermissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAllPermissions(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function hasAnyPermission(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function hasRole(role: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(role);
}
