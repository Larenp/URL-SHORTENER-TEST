import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

export class DatabaseConnectionException extends AppException {
  constructor(cause?: unknown) {
    super(
      cause instanceof Error
        ? `Database connection failed: ${cause.message}`
        : 'Database connection failed',
      HttpStatus.SERVICE_UNAVAILABLE,
      'DATABASE_CONNECTION_ERROR',
    );
  }
}

export class CacheConnectionException extends AppException {
  constructor(cause?: unknown) {
    super(
      cause instanceof Error
        ? `Cache connection failed: ${cause.message}`
        : 'Cache connection failed',
      HttpStatus.SERVICE_UNAVAILABLE,
      'CACHE_CONNECTION_ERROR',
    );
  }
}
