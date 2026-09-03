import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto, CreateStaffUserDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 12;

// In-memory store for password reset tokens, for the Phase 0 draft only.
// Swap this for a `PasswordResetToken` Prisma model + DB table before
// going to production (in-memory won't survive a server restart or
// work across multiple instances).
const resetTokenStore = new Map<string, { userId: string; expiresAt: number }>();

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ---------- Registration ----------

  // Public signup endpoint. Always creates a STUDENT — staff accounts
  // are provisioned separately by an Admin (see createStaffUser below).
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: UserRole.STUDENT,
      },
    });

    return this.issueTokens(user.id, user.email, user.role, user.tenantId);
  }

  // Called from the Phase 8 Admin Panel's "Add User" screen — not exposed
  // as a public route. The controller for this should be guarded with
  // @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER).
  async createStaffUser(dto: CreateStaffUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        campusId: dto.campusId,
      },
    });
  }

  // ---------- Login ----------

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user.id, user.email, user.role, user.tenantId);
  }

  // ---------- Token refresh ----------

  async refresh(userId: string, email: string, role: UserRole, tenantId: string | null) {
    // Re-verify the user still exists and hasn't been deactivated
    // since the refresh token was issued.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return this.issueTokens(user.id, user.email, user.role, user.tenantId);
  }

  private issueTokens(userId: string, email: string, role: UserRole, tenantId: string | null) {
    const payload = { sub: userId, email, role, tenantId };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES') ?? '15m',
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES') ?? '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, email, role, tenantId },
    };
  }

  // ---------- Password reset ----------

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return the same generic response whether or not the email
    // exists — prevents attackers from using this endpoint to discover
    // which emails are registered.
    if (!user) {
      return { message: 'If an account exists for this email, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    resetTokenStore.set(token, { userId: user.id, expiresAt: Date.now() + 60 * 60 * 1000 }); // 1 hour

    // TODO (Phase 6 — Notifications module): send this token via the
    // email provider instead of returning it directly. Returning it here
    // is ONLY for local development convenience.
    return {
      message: 'If an account exists for this email, a reset link has been sent.',
      devOnlyToken: this.config.get<string>('NODE_ENV') === 'development' ? token : undefined,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const entry = resetTokenStore.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: entry.userId },
      data: { passwordHash },
    });

    resetTokenStore.delete(token);
    return { message: 'Password has been reset successfully' };
  }
}
