import { Role } from '@prisma/client';
import { Permission } from './permission.enum';

const MEMBER_PERMISSIONS: readonly Permission[] = [
  Permission.USER_READ,
  Permission.URL_READ,
  Permission.URL_CREATE,
  Permission.URL_MANAGE_OWN,
  Permission.ANALYTICS_READ,
];

const TENANT_ADMIN_ONLY_PERMISSIONS: readonly Permission[] = [
  Permission.TENANT_MANAGE,
  Permission.USER_MANAGE,
  Permission.URL_MANAGE,
];

/**
 * TENANT_ADMIN is MEMBER's permissions plus admin-only ones — this
 * composition *is* the role hierarchy. There's no separate "does role A
 * outrank role B" check anywhere; a role either grants a permission or it
 * doesn't, and admin grants everything member does by listing member's
 * permissions explicitly here rather than through inheritance machinery.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [Role.MEMBER]: MEMBER_PERMISSIONS,
  [Role.TENANT_ADMIN]: [...MEMBER_PERMISSIONS, ...TENANT_ADMIN_ONLY_PERMISSIONS],
};
