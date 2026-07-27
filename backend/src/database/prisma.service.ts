import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { DatabaseConnectionException } from '../common/exceptions/infrastructure.exception';
import { retryWithBackoff } from '../common/utils/retry.util';
import type { Configuration } from '../config/configuration';

const CONNECTION_RETRIES = 5;
const CONNECTION_RETRY_DELAY_MS = 1000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<Configuration>) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow('database.url', { infer: true }),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await retryWithBackoff(() => this.$connect(), {
        retries: CONNECTION_RETRIES,
        delayMs: CONNECTION_RETRY_DELAY_MS,
        onRetry: (attempt, error) => {
          this.logger.warn(
            `Database connection attempt ${attempt}/${CONNECTION_RETRIES} failed: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        },
      });
      this.logger.log('Database connection established');
    } catch (error) {
      throw new DatabaseConnectionException(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
