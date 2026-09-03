import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

// Fields that are safe to return to clients — never include passwordHash.
const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  avatarUrl: true,
  campusId: true,
  tenantId: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateOwnProfile(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_USER_SELECT,
    });
  }

  // ---------- Admin-only operations (Phase 8 admin panel calls these) ----------

  async listUsers(params: { role?: UserRole; campusId?: string; search?: string }) {
    return this.prisma.user.findMany({
      where: {
        role: params.role,
        campusId: params.campusId,
        OR: params.search
          ? [
              { fullName: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Suspend/reactivate a student, or change a staff member's role/campus.
  // NOTE: consider adding an `isActive` boolean column to the User model
  // in Phase 8 to support proper suspension rather than deletion.
  async updateUserByAdmin(id: string, data: { role?: UserRole; campusId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
  }
}
