import { NotFoundException } from '@nestjs/common';
import { ContentBlocksService } from './content-blocks.service';

function buildService() {
  const prisma = {
    contentBlock: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const service = new ContentBlocksService(prisma as any);
  return { service, prisma };
}

describe('ContentBlocksService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findForSection', () => {
    it('only queries active blocks for the public-facing endpoint', async () => {
      const { service, prisma } = buildService();
      prisma.contentBlock.findMany.mockResolvedValue([]);

      await service.findForSection('testimonials');

      expect(prisma.contentBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { section: 'testimonials', isActive: true },
        }),
      );
    });
  });

  describe('create', () => {
    it('assigns the next order number within that section, not globally', async () => {
      const { service, prisma } = buildService();
      prisma.contentBlock.count.mockResolvedValue(3); // 3 existing "faq" blocks
      prisma.contentBlock.create.mockResolvedValue({ id: 'block-1', order: 3 });

      await service.create({ section: 'faq', title: 'New question' });

      expect(prisma.contentBlock.count).toHaveBeenCalledWith({ where: { section: 'faq' } });
      expect(prisma.contentBlock.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ order: 3 }) }),
      );
    });
  });

  describe('update / remove', () => {
    it('throws NotFoundException when updating a nonexistent block', async () => {
      const { service, prisma } = buildService();
      prisma.contentBlock.findUnique.mockResolvedValue(null);

      await expect(service.update('ghost-block', { title: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('can soft-deactivate a block via isActive rather than deleting it', async () => {
      const { service, prisma } = buildService();
      prisma.contentBlock.findUnique.mockResolvedValue({ id: 'block-1' });
      prisma.contentBlock.update.mockResolvedValue({ id: 'block-1', isActive: false });

      const result = await service.update('block-1', { isActive: false });
      expect(result.isActive).toBe(false);
    });
  });

  describe('reorder', () => {
    it('updates all items in the batch via a single transaction', async () => {
      const { service, prisma } = buildService();

      await service.reorder('faq', {
        items: [
          { id: 'block-1', order: 1 },
          { id: 'block-2', order: 0 },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.contentBlock.update).toHaveBeenCalledTimes(2);
    });
  });
});
