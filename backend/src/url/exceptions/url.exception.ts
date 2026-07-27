import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';

export class UrlNotFoundException extends AppException {
  constructor() {
    super('URL not found', HttpStatus.NOT_FOUND, 'URL_NOT_FOUND');
  }
}

export class ShortCodeAlreadyExistsException extends AppException {
  constructor(shortCode: string) {
    super(
      `Short code "${shortCode}" is already in use`,
      HttpStatus.CONFLICT,
      'SHORT_CODE_ALREADY_EXISTS',
    );
  }
}

export class ShortCodeGenerationFailedException extends AppException {
  constructor() {
    super(
      'Could not generate a unique short code, please try again',
      HttpStatus.SERVICE_UNAVAILABLE,
      'SHORT_CODE_GENERATION_FAILED',
    );
  }
}
