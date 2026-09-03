import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/ticket.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

const STAFF_ROLES = [UserRole.ADMIN, UserRole.SUPPORT];

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  // ---------- Creating & viewing ----------

  async createTicket(user: RequestUser, dto: CreateTicketDto) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: { userId: user.id, subject: dto.subject },
      });
      await tx.ticketMessage.create({
        data: { ticketId: ticket.id, authorId: user.id, body: dto.message },
      });
      return ticket;
    });
  }

  async findMine(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findAll(filters: { status?: TicketStatus; assignedToId?: string }) {
    return this.prisma.supportTicket.findMany({
      where: filters,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getOne(id: string, user: RequestUser) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true, role: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isStaff = STAFF_ROLES.includes(user.role);
    if (!isStaff && ticket.userId !== user.id) {
      throw new ForbiddenException('This ticket does not belong to you');
    }
    return ticket;
  }

  // ---------- Replying ----------

  async reply(id: string, user: RequestUser, body: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isStaff = STAFF_ROLES.includes(user.role);
    if (!isStaff && ticket.userId !== user.id) {
      throw new ForbiddenException('This ticket does not belong to you');
    }

    const message = await this.prisma.ticketMessage.create({
      data: { ticketId: id, authorId: user.id, body },
    });

    // A staff reply on a still-OPEN ticket signals work has begun — bump
    // it to IN_PROGRESS automatically. Never auto-change RESOLVED/CLOSED
    // tickets this way; a status change there should be an explicit
    // staff action, not a side effect of typing a message.
    if (isStaff && ticket.status === TicketStatus.OPEN) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    return message;
  }

  // ---------- Staff management ----------

  async updateStatus(id: string, status: TicketStatus) {
    await this.ensureExists(id);
    return this.prisma.supportTicket.update({ where: { id }, data: { status } });
  }

  async assign(id: string, assignedToId: string) {
    await this.ensureExists(id);
    return this.prisma.supportTicket.update({ where: { id }, data: { assignedToId } });
  }

  private async ensureExists(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }
}
