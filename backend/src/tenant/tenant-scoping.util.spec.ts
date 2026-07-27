import { ForbiddenException } from '@nestjs/common';
import {
  requireTenantId,
  scopeCreateData,
  scopeCreateManyData,
  scopeWhere,
} from './tenant-scoping.util';

describe('tenant-scoping.util', () => {
  describe('requireTenantId', () => {
    it('returns the tenantId when present', () => {
      expect(requireTenantId('tenant-1')).toBe('tenant-1');
    });

    it('throws when tenantId is undefined (fail closed)', () => {
      expect(() => requireTenantId(undefined)).toThrow(ForbiddenException);
    });
  });

  describe('scopeWhere', () => {
    it('adds tenantId to an existing where clause', () => {
      expect(scopeWhere({ email: 'dev@example.com' }, 'tenant-1')).toEqual({
        email: 'dev@example.com',
        tenantId: 'tenant-1',
      });
    });

    it('builds a where clause from undefined', () => {
      expect(scopeWhere(undefined, 'tenant-1')).toEqual({ tenantId: 'tenant-1' });
    });

    it('a client-supplied tenantId cannot override the real one — request context always wins', () => {
      expect(scopeWhere({ tenantId: 'attacker-supplied-tenant' }, 'real-tenant')).toEqual({
        tenantId: 'real-tenant',
      });
    });
  });

  describe('scopeCreateData', () => {
    it('stamps tenantId onto create data', () => {
      expect(scopeCreateData({ email: 'new@example.com' }, 'tenant-1')).toEqual({
        email: 'new@example.com',
        tenantId: 'tenant-1',
      });
    });

    it('a client-supplied tenantId in create data is overridden by the real one', () => {
      expect(scopeCreateData({ tenantId: 'attacker-supplied' }, 'real-tenant')).toEqual({
        tenantId: 'real-tenant',
      });
    });
  });

  describe('scopeCreateManyData', () => {
    it('stamps tenantId onto every row of an array', () => {
      expect(
        scopeCreateManyData([{ email: 'a@example.com' }, { email: 'b@example.com' }], 'tenant-1'),
      ).toEqual([
        { email: 'a@example.com', tenantId: 'tenant-1' },
        { email: 'b@example.com', tenantId: 'tenant-1' },
      ]);
    });

    it('stamps tenantId onto a single object when data is not an array', () => {
      expect(scopeCreateManyData({ email: 'a@example.com' }, 'tenant-1')).toEqual({
        email: 'a@example.com',
        tenantId: 'tenant-1',
      });
    });
  });
});
