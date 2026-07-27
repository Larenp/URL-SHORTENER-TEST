import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';

export class InvalidCredentialsException extends AppException {
  constructor() {
    super('Invalid email or password', HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS');
  }
}

export class InvalidRefreshTokenException extends AppException {
  constructor() {
    super('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED, 'INVALID_REFRESH_TOKEN');
  }
}
