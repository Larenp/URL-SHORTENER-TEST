export enum Permission {
  // Tenant settings
  TENANT_MANAGE = 'tenant:manage',

  // User management within a tenant
  USER_READ = 'user:read',
  USER_MANAGE = 'user:manage',

  // URL management — no endpoints exist yet; see docs/architecture/decisions.md
  URL_READ = 'url:read',
  URL_CREATE = 'url:create',
  URL_MANAGE_OWN = 'url:manage_own',
  URL_MANAGE = 'url:manage',

  // Analytics — no endpoints exist yet
  ANALYTICS_READ = 'analytics:read',
}
