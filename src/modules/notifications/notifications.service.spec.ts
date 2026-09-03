import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

function buildService() {
  const prisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new NotificationsService(prisma as any);
  return { service, prisma };
}

describe('NotificationsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a notification row for a given user', async () => {
    const { service, prisma } = buildService();
    prisma.notification.create.mockResolvedValue({ id: 'notif-1' });

    await service.create('user-1', 'Title', 'Body text');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', title: 'Title', body: 'Body text' },
    });
  });

  it('blocks marking a notification that belongs to someone else as read', async () => {
    const { service, prisma } = buildService();
    prisma.notification.findUnique.mockResolvedValue({ id: 'notif-1', userId: 'someone-else' });

    await expect(service.markRead('notif-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('marks the caller\'s own notification as read', async () => {
    const { service, prisma } = buildService();
    prisma.notification.findUnique.mockResolvedValue({ id: 'notif-1', userId: 'user-1' });
    prisma.notification.update.mockResolvedValue({ id: 'notif-1', isRead: true });

    const result = await service.markRead('notif-1', 'user-1');
    expect(result.isRead).toBe(true);
  });

  it('only marks unread notifications when markAllRead is called', async () => {
    const { service, prisma } = buildService();
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await service.markAllRead('user-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: { isRead: true },
    });
  });
});
