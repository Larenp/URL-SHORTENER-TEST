import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { UrlModule } from './url/url.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    LoggerModule,
    DatabaseModule,
    CacheModule,
    HealthModule,
    UsersModule,
    // AuthModule must import before AuthorizationModule: both register a
    // global APP_GUARD, and AuthorizationGuard reads request.user, which
    // only exists once AuthModule's JwtAuthGuard has already run. Unlike
    // TenantModule (an interceptor, guaranteed to run after every guard
    // regardless of order), guard-to-guard ordering follows registration
    // order — see docs/architecture/decisions.md.
    AuthModule,
    AuthorizationModule,
    TenantModule,
    UrlModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
