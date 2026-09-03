import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // ---------- Internal API (called by other services, not exposed over HTTP) ----------
  //
  // This is deliberately just an in-app row insert for now — no email/SMS/
  // WhatsApp delivery. Phase 0's plan called for wiring a real provider
  // (Resend/SendGrid) here; this method is the single choke point where
  // that gets added later, so every module that calls `create()` today
  // will automatically start sending real emails/push once that's wired,
  // with zero changes needed in the calling modules.
  async create(userId: string, title: string, body: string) {
    return this.prisma.notification.create({ data: { userId, title, body } });
  }

  // ---------- Student-facing ----------

  async findMine(userId: string, unreadOnly?: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: unreadOnly ? false : undefined },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }
}
