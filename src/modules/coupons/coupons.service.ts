import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

// Pure function, exported standalone for isolated unit testing — same
// pattern as gradeQuizAttempt in Phase 4. Takes a plain coupon-shaped
// object and a base amount, returns the final amount after discount.
// Throws BadRequestException for any invalid/expired/exhausted coupon
// so callers (checkout) can surface a clear error to the student.
export function applyCoupon(
  coupon: {
    isActive: boolean;
    expiresAt: Date | null;
    maxUses: number | null;
    usedCount: number;
    discountPercent: number | null;
    discountAmount: any | null;
  },
  baseAmount: number,
): { finalAmount: number; discountApplied: number } {
  if (!coupon.isActive) {
    throw new BadRequestException('This coupon is no longer active');
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new BadRequestException('This coupon has expired');
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new BadRequestException('This coupon has reached its usage limit');
  }

  let discountApplied = 0;
  if (coupon.discountPercent) {
    discountApplied = Math.round((baseAmount * coupon.discountPercent) / 100);
  } else if (coupon.discountAmount) {
    discountApplied = Number(coupon.discountAmount);
  }

  // Never let a discount push the price below zero or above the base price.
  discountApplied = Math.min(discountApplied, baseAmount);
  const finalAmount = Math.max(baseAmount - discountApplied, 0);

  return { finalAmount, discountApplied };
}

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  // ---------- Admin CRUD ----------

  async create(dto: CreateCouponDto) {
    if (!dto.discountPercent && !dto.discountAmount) {
      throw new BadRequestException('Provide either discountPercent or discountAmount');
    }
    if (dto.discountPercent && dto.discountAmount) {
      throw new BadRequestException('Provide only ONE of discountPercent or discountAmount, not both');
    }

    const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('A coupon with this code already exists');

    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        discountPercent: dto.discountPercent,
        discountAmount: dto.discountAmount,
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async findAll() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.ensureExists(id);
    return this.prisma.coupon.update({
      where: { id },
      data: { ...dto, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.coupon.delete({ where: { id } });
  }

  // ---------- Checkout-time validation ----------

  // Called by PaymentsService during checkout. Returns the coupon row
  // (needed so PaymentsService can attach couponId to the Payment and
  // increment usedCount atomically within its own transaction) plus the
  // computed discount.
  async validateForCheckout(code: string, baseAmount: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new NotFoundException('Coupon code not found');

    const { finalAmount, discountApplied } = applyCoupon(coupon, baseAmount);
    return { coupon, finalAmount, discountApplied };
  }

  private async ensureExists(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }
}
