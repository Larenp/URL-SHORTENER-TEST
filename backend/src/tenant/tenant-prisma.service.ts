import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from './tenant-context.service';
import { tenantScopingExtension } from './tenant-prisma.extension';

function createTenantClient(prisma: PrismaService, tenantContext: TenantContextService) {
  return prisma.$extends(tenantScopingExtension(tenantContext));
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

@Injectable()
export class TenantPrismaService {
  readonly client: TenantPrismaClient;

  constructor(prisma: PrismaService, tenantContext: TenantContextService) {
    this.client = createTenantClient(prisma, tenantContext);
  }
}

