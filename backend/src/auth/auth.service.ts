import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PasswordService } from './password.service';
import { UsersService } from '../users/users.service';
import {
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from './exceptions/auth.exception';
import type { AuthTokens, JwtPayload } from './interfaces/jwt-payload.interface';
import type { Configuration } from '../config/configuration';
import type { User } from '@prisma/client';
import type { JwtSignOptions } from '@nestjs/jwt';

// A fixed, valid-format bcrypt hash with no corresponding plaintext password.
// Used only as a timing decoy — see login() for why.
const DECOY_PASSWORD_HASH = '$2b$12$b3iNwaQDSLvk3l/MRSU6Auq4X3Rmpf4rvS7NuYg3fM2yiCAWUDtFm';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Configuration>,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.usersService.findByEmail(email);

    // bcrypt.compare always runs, whether or not the user exists, against a
    // real hash or the decoy above. Returning early on a missing user would
    // make login measurably faster for unregistered emails than for
    // registered ones with a wrong password — an oracle for enumerating
    // valid accounts. Always paying the bcrypt cost closes that gap.
    const isPasswordValid = await this.passwordService.compare(
      password,
      user?.passwordHash ?? DECOY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findById(payload.sub);

    if (!user?.refreshTokenHash || !this.matchesStoredHash(refreshToken, user.refreshTokenHash)) {
      throw new InvalidRefreshTokenException();
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshTokenHash(userId, null);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const authConfig = this.configService.getOrThrow('auth', { infer: true });

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
          jti: randomUUID(),
        } satisfies JwtPayload,
        {
          secret: authConfig.accessTokenSecret,
          expiresIn: authConfig.accessTokenExpiresIn as JwtSignOptions['expiresIn'],
        },
      ),
      this.jwtService.signAsync(
        {
          sub: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
          jti: randomUUID(),
        } satisfies JwtPayload,
        {
          secret: authConfig.refreshTokenSecret,
          expiresIn: authConfig.refreshTokenExpiresIn as JwtSignOptions['expiresIn'],
        },
      ),
    ]);

    await this.usersService.updateRefreshTokenHash(user.id, this.hashToken(refreshToken));

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresInSeconds(authConfig.accessTokenExpiresIn),
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    const authConfig = this.configService.getOrThrow('auth', { infer: true });

    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: authConfig.refreshTokenSecret,
      });
    } catch {
      throw new InvalidRefreshTokenException();
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private matchesStoredHash(token: string, storedHash: string): boolean {
    const candidateHash = Buffer.from(this.hashToken(token));
    const storedHashBuffer = Buffer.from(storedHash);

    return (
      candidateHash.length === storedHashBuffer.length &&
      timingSafeEqual(candidateHash, storedHashBuffer)
    );
  }

  private parseExpiresInSeconds(expiresIn: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);

    if (!match) {
      return 0;
    }

    const value = parseInt(match[1], 10);
    const unitToSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

    return value * unitToSeconds[match[2]];
  }
}
