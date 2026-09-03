import { BadRequestException, ConflictException } from '@nestjs/common';
import { applyCoupon, CouponsService } from './coupons.service';

describe('applyCoupon (pure discount logic)', () => {
  const baseCoupon = {
    isActive: true,
    expiresAt: null as Date | null,
    maxUses: null as number | null,
    usedCount: 0,
    discountPercent: null as number | null,
    discountAmount: null as any,
  };

  it('applies a percentage discount correctly', () => {
    const result = applyCoupon({ ...baseCoupon, discountPercent: 20 }, 1000);
    expect(result.discountApplied).toBe(200);
    expect(result.finalAmount).toBe(800);
  });

  it('applies a fixed-amount discount correctly', () => {
    const result = applyCoupon({ ...baseCoupon, discountAmount: 150 }, 1000);
    expect(result.discountApplied).toBe(150);
    expect(result.finalAmount).toBe(850);
  });

  it('never lets a fixed discount push the price below zero', () => {
    const result = applyCoupon({ ...baseCoupon, discountAmount: 5000 }, 1000);
    expect(result.finalAmount).toBe(0);
    expect(result.discountApplied).toBe(1000); // capped at the base amount, not 5000
  });

  it('rejects an inactive coupon', () => {
    expect(() => applyCoupon({ ...baseCoupon, isActive: false }, 1000)).toThrow(BadRequestException);
  });

  it('rejects an expired coupon', () => {
    const expired = { ...baseCoupon, expiresAt: new Date('2000-01-01') };
    expect(() => applyCoupon(expired, 1000)).toThrow(BadRequestException);
  });

  it('accepts a coupon that has not expired yet', () => {
    const future = { ...baseCoupon, expiresAt: new Date('2099-01-01'), discountPercent: 10 };
    expect(() => applyCoupon(future, 1000)).not.toThrow();
  });

  it('rejects a coupon that has hit its usage cap', () => {
    const maxedOut = { ...baseCoupon, maxUses: 5, usedCount: 5 };
    expect(() => applyCoupon(maxedOut, 1000)).toThrow(BadRequestException);
  });

  it('accepts a coupon just under its usage cap', () => {
    const almostMaxed = { ...baseCoupon, maxUses: 5, usedCount: 4, discountPercent: 10 };
    expect(() => applyCoupon(almostMaxed, 1000)).not.toThrow();
  });

  it('rounds percentage discounts to whole numbers', () => {
    const result = applyCoupon({ ...baseCoupon, discountPercent: 33 }, 1000);
    expect(result.discountApplied).toBe(330); // 1000 * 0.33 = 330 exactly, sanity check
    const oddResult = applyCoupon({ ...baseCoupon, discountPercent: 15 }, 999);
    expect(Number.isInteger(oddResult.discountApplied)).toBe(true);
  });
});

describe('CouponsService', () => {
  function buildService() {
    const prisma = {
      coupon: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const service = new CouponsService(prisma as any);
    return { service, prisma };
  }

  describe('create', () => {
    it('rejects creating a coupon with neither discount type set', async () => {
      const { service } = buildService();
      await expect(service.create({ code: 'SAVE10' } as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects creating a coupon with BOTH discount types set', async () => {
      const { service } = buildService();
      await expect(
        service.create({ code: 'SAVE10', discountPercent: 10, discountAmount: '100' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate coupon code', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({ code: 'SAVE10', discountPercent: 10 } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('uppercases the coupon code on creation', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue(null);
      prisma.coupon.create.mockResolvedValue({ id: 'coupon-1', code: 'SAVE10' });

      await service.create({ code: 'save10', discountPercent: 10 } as any);

      expect(prisma.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'SAVE10' }) }),
      );
    });
  });

  describe('validateForCheckout', () => {
    it('looks up the coupon case-insensitively via uppercase normalization', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue({
        id: 'coupon-1',
        isActive: true,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        discountPercent: 10,
        discountAmount: null,
      });

      await service.validateForCheckout('save10', 1000);

      expect(prisma.coupon.findUnique).toHaveBeenCalledWith({ where: { code: 'SAVE10' } });
    });
  });
});
