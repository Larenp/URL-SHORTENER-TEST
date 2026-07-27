import { HttpException } from '@nestjs/common';
import type { HttpStatus } from '@nestjs/common';

export abstract class AppException extends HttpException {
  protected constructor(
    message: string,
    status: HttpStatus,
    private readonly errorCode: string,
  ) {
    super({ message, error: errorCode }, status);
  }

  getErrorCode(): string {
    return this.errorCode;
  }
}
