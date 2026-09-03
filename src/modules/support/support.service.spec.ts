import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';
import { TicketStatus, UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    supportTicket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    ticketMessage: { create: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const service = new SupportService(prisma as any);
  return { service, prisma };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };
const OTHER_STUDENT = { id: 'student-2', role: UserRole.STUDENT };
const SUPPORT_STAFF = { id: 'support-1', role: UserRole.SUPPORT };
const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };

describe('SupportService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createTicket', () => {
    it('creates both the ticket and its first message together', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-1' });
      prisma.ticketMessage.create.mockResolvedValue({ id: 'msg-1' });

      const result = await service.createTicket(STUDENT, {
        subject: 'Cant access my course',
        message: 'I paid but still see locked content',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalled();
      expect(prisma.ticketMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ticketId: 'ticket-1', authorId: STUDENT.id }),
        }),
      );
      expect(result).toEqual({ id: 'ticket-1' });
    });
  });

  describe('getOne', () => {
    it('blocks a student from viewing someone else\'s ticket', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, messages: [] });

      await expect(service.getOne('ticket-1', OTHER_STUDENT)).rejects.toThrow(ForbiddenException);
    });

    it('allows the ticket owner to view their own ticket', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, messages: [] });

      const result = await service.getOne('ticket-1', STUDENT);
      expect(result.id).toBe('ticket-1');
    });

    it('allows SUPPORT staff to view any ticket, not just their own', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, messages: [] });

      const result = await service.getOne('ticket-1', SUPPORT_STAFF);
      expect(result.id).toBe('ticket-1');
    });

    it('throws NotFoundException for a nonexistent ticket', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(service.getOne('ghost-ticket', STUDENT)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reply', () => {
    it('blocks a non-owner student from replying to someone else\'s ticket', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, status: TicketStatus.OPEN });

      await expect(service.reply('ticket-1', OTHER_STUDENT, 'butting in')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('auto-transitions an OPEN ticket to IN_PROGRESS when staff replies', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, status: TicketStatus.OPEN });
      prisma.ticketMessage.create.mockResolvedValue({ id: 'msg-1' });

      await service.reply('ticket-1', ADMIN, 'Looking into this now');

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    });

    it('does NOT change status when a student replies to their own OPEN ticket', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, status: TicketStatus.OPEN });
      prisma.ticketMessage.create.mockResolvedValue({ id: 'msg-1' });

      await service.reply('ticket-1', STUDENT, 'Any updates?');

      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('does NOT reopen or change a RESOLVED ticket just because staff replied', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: STUDENT.id, status: TicketStatus.RESOLVED });
      prisma.ticketMessage.create.mockResolvedValue({ id: 'msg-1' });

      await service.reply('ticket-1', ADMIN, 'Following up post-resolution');

      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus / assign', () => {
    it('throws NotFoundException when updating status on a nonexistent ticket', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus('ghost-ticket', TicketStatus.RESOLVED)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('assigns a ticket to a staff member', async () => {
      const { service, prisma } = buildService();
      prisma.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1' });
      prisma.supportTicket.update.mockResolvedValue({ id: 'ticket-1', assignedToId: 'support-1' });

      const result = await service.assign('ticket-1', 'support-1');
      expect(result.assignedToId).toBe('support-1');
    });
  });
});
