import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheConnectionException } from '../common/exceptions/infrastructure.exception';
import type { Configuration } from '../config/configuration';

const CONNECTION_RETRIES = 5;
const CONNECTION_RETRY_DELAY_MS = 1000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService<Configuration>) {
    this.client = new Redis(configService.getOrThrow('cache.url', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: CONNECTION_RETRIES,
      retryStrategy: (attempt) => {
        if (attempt > CONNECTION_RETRIES) {
          return null;
        }
        const delay = attempt * CONNECTION_RETRY_DELAY_MS;
        this.logger.warn(
          `Redis connection attempt ${attempt}/${CONNECTION_RETRIES}, retrying in ${delay}ms`,
        );
        return delay;
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log('Cache connection established');
    } catch (error) {
      throw new CacheConnectionException(error);
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
