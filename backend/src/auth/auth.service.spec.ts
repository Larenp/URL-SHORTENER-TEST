import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';
import {
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from './exceptions/auth.exception';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PasswordService } from './password.service';
import type { UsersService } from '../users/users.service';
import type { User } from '@prisma/client';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let passwordService: jest.Mocked<PasswordService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const authConfig = {
    accessTokenSecret: 'access-secret',
    accessTokenExpiresIn: '15m',
    refreshTokenSecret: 'refresh-secret',
    refreshTokenExpiresIn: '7d',
  };

  const user: User = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'dev@example.com',
    passwordHash: 'stored-hash',
    role: Role.MEMBER,
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    passwordService = {
      hash: jest.fn(),
      compare: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      getOrThrow: jest.fn().mockReturnValue(authConfig),
    } as unknown as jest.Mocked<ConfigService>;

    authService = new AuthService(usersService, passwordService, jwtService, configService);
  });

  describe('login', () => {
    it('issues tokens for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValueOnce('access.jwt').mockResolvedValueOnce('refresh.jwt');
      usersService.updateRefreshTokenHash.mockResolvedValue(user);

      const result = await authService.login('dev@example.com', 'correct-password');

      expect(result.accessToken).toBe('access.jwt');
      expect(result.refreshToken).toBe('refresh.jwt');
      expect(result.expiresIn).toBe(900);
    });

    it('rejects a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(false);

      await expect(authService.login('dev@example.com', 'wrong-password')).rejects.toThrow(
        InvalidCredentialsException,
      );
    });

    it('rejects a nonexistent user without skipping the password comparison', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.compare.mockResolvedValue(false);

      await expect(authService.login('nobody@example.com', 'irrelevant')).rejects.toThrow(
        InvalidCredentialsException,
      );

      // The core of the timing-attack fix: bcrypt.compare must run even when
      // there's no user, against a decoy hash, so that "no such user" and
      // "wrong password" take comparable time. If this assertion ever fails,
      // the timing side-channel this test guards against has come back.
      expect(passwordService.compare).toHaveBeenCalledTimes(1);
      expect(passwordService.compare).toHaveBeenCalledWith('irrelevant', expect.any(String));
    });
  });

  describe('refresh', () => {
    it('rotates tokens when the refresh token matches the stored hash', async () => {
      const validRefreshToken = 'valid.refresh.token';
      jwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        jti: 'jti-1',
      });
      usersService.findById.mockResolvedValue({
        ...user,
        refreshTokenHash: createHash('sha256').update(validRefreshToken).digest('hex'),
      });
      jwtService.signAsync.mockResolvedValueOnce('new.access').mockResolvedValueOnce('new.refresh');
      usersService.updateRefreshTokenHash.mockResolvedValue(user);

      const result = await authService.refresh(validRefreshToken);

      expect(result.accessToken).toBe('new.access');
      expect(result.refreshToken).toBe('new.refresh');
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(user.id, expect.any(String));
    });

    it('rejects a refresh token that does not match the stored hash (replay of a rotated-out token)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        jti: 'jti-1',
      });
      usersService.findById.mockResolvedValue({
        ...user,
        refreshTokenHash: 'hash-of-a-different-token',
      });

      await expect(authService.refresh('stale.refresh.token')).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });

    it('rejects a token with an invalid signature', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(authService.refresh('garbage.token')).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });

    it('rejects when the user has no active refresh session', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        jti: 'jti-1',
      });
      usersService.findById.mockResolvedValue({ ...user, refreshTokenHash: null });

      await expect(authService.refresh('some.refresh.token')).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token hash', async () => {
      usersService.updateRefreshTokenHash.mockResolvedValue(user);

      await authService.logout(user.id);

      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(user.id, null);
    });
  });
});
