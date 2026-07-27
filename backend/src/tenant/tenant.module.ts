import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantPrismaService } from './tenant-prisma.service';

@Global()
@Module({
  providers: [
    TenantContextService,
    TenantPrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
  exports: [TenantContextService, TenantPrismaService],
})
export class TenantModule {}
