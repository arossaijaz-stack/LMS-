import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '@prisma/client';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));
const bcrypt = require('bcryptjs');

function buildService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
  };
  const config = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '7d',
        NODE_ENV: 'development',
      };
      return map[key];
    }),
  };

  const service = new AuthService(prisma as any, jwt as any, config as any);
  return { service, prisma, jwt, config };
}

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('creates a STUDENT and issues tokens when the email is new', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'ali@example.com',
        role: UserRole.STUDENT,
        tenantId: null,
      });

      const result = await service.register({
        fullName: 'Ali Khan',
        email: 'ali@example.com',
        password: 'password123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: UserRole.STUDENT, email: 'ali@example.com' }),
        }),
      );
      expect(result).toHaveProperty('accessToken', 'signed.jwt.token');
      expect(result).toHaveProperty('refreshToken', 'signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'ali@example.com',
        role: UserRole.STUDENT,
        tenantId: null,
      });
    });

    it('throws ConflictException when the email already exists', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({ fullName: 'Ali', email: 'ali@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues tokens when credentials are correct', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'ali@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.STUDENT,
        tenantId: null,
      });
      bcrypt.compare.mockResolvedValue(true);

      const result = await service.login({ email: 'ali@example.com', password: 'password123' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.email).toBe('ali@example.com');
    });

    it('throws UnauthorizedException when the email does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'ali@example.com',
        passwordHash: 'hashed-password',
        role: UserRole.STUDENT,
      });
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.login({ email: 'ali@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('returns the same generic message whether or not the email exists (no user enumeration)', async () => {
      const { service, prisma } = buildService();

      prisma.user.findUnique.mockResolvedValueOnce(null);
      const resultForMissingUser = await service.forgotPassword('nobody@example.com');

      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', email: 'ali@example.com' });
      const resultForRealUser = await service.forgotPassword('ali@example.com');

      expect(resultForMissingUser.message).toBe(resultForRealUser.message);
    });

    it('includes a devOnlyToken only in development', async () => {
      const { service, prisma, config } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'ali@example.com' });

      const devResult = await service.forgotPassword('ali@example.com');
      expect(devResult.devOnlyToken).toBeDefined();

      config.get.mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : (undefined as any),
      );
      const prodResult = await service.forgotPassword('ali@example.com');
      expect(prodResult.devOnlyToken).toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown or expired token', async () => {
      const { service } = buildService();
      await expect(service.resetPassword('bogus-token', 'newPassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('accepts a valid token issued by forgotPassword and updates the password', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'ali@example.com' });
      const { devOnlyToken } = await service.forgotPassword('ali@example.com');

      prisma.user.update.mockResolvedValue({ id: 'user-1' });
      const result = await service.resetPassword(devOnlyToken as string, 'newPassword123');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result.message).toMatch(/successfully/i);

      // Token must be single-use — reusing it should now fail.
      await expect(service.resetPassword(devOnlyToken as string, 'anotherPassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
