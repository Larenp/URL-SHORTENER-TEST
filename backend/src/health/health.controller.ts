import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { Public } from '../auth/decorators/public.decorator';

const MAX_HEAP_BYTES = 300 * 1024 * 1024;
const MAX_RSS_BYTES = 300 * 1024 * 1024;

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', MAX_HEAP_BYTES),
      () => this.memory.checkRSS('memory_rss', MAX_RSS_BYTES),
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisHealth.check('cache'),
    ]);
  }
}
