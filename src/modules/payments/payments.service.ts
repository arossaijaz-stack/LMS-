import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnrollmentStatus, PaymentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentProviderService } from './payment-provider.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CheckoutDto, PaymentWebhookDto } from './dto/payment.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private couponsService: CouponsService,
    private provider: PaymentProviderService,
    private enrollmentsService: EnrollmentsService,
    private notificationsService: NotificationsService,
    private config: ConfigService,
  ) {}

  // ---------- Checkout ----------

  async checkout(user: RequestUser, dto: CheckoutDto) {
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found');
    }
    if (course.isFreeTrial) {
      throw new BadRequestException(
        'This course is free — enroll directly via POST /enrollments instead of checking out',
      );
    }

    // Reuse an existing PENDING enrollment if the student abandoned a
    // previous checkout attempt, rather than creating a duplicate row
    // (Enrollment has a unique [userId, courseId] constraint anyway).
    let enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: dto.courseId } },
    });

    if (enrollment?.status === EnrollmentStatus.ACTIVE) {
      throw new ConflictException('You are already enrolled in this course');
    }
    if (!enrollment) {
      enrollment = await this.prisma.enrollment.create({
        data: { userId: user.id, courseId: dto.courseId, status: EnrollmentStatus.PENDING },
      });
    }

    const baseAmount = Number(course.price);
    let finalAmount = baseAmount;
    let couponId: string | undefined;

    if (dto.couponCode) {
      const { coupon, finalAmount: discounted } = await this.couponsService.validateForCheckout(
        dto.couponCode,
        baseAmount,
      );
      finalAmount = discounted;
      couponId = coupon.id;
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        courseId: course.id,
        enrollmentId: enrollment.id,
        couponId,
        amount: finalAmount,
        gateway: dto.gateway,
        status: PaymentStatus.PENDING,
      },
    });

    const session = await this.provider.createCheckoutSession({
      gateway: dto.gateway,
      amount: finalAmount,
      currency: 'PKR',
      description: `Enrollment: ${course.title}`,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { transactionRef: session.providerRef },
    });

    return { paymentId: payment.id, amount: finalAmount, checkoutUrl: session.checkoutUrl };
  }

  // ---------- Webhook (gateway calls this) ----------

  // rawBody is the exact, unparsed request body string — REQUIRED for
  // real signature verification (HMAC is computed over exact bytes; a
  // re-serialized JSON object can differ in key order/whitespace from
  // what the gateway actually signed, which would make verification
  // fail even for a genuine webhook). See main.ts's `rawBody: true` and
  // the controller's use of `@Req()` for how this gets captured.
  async handleWebhook(
    dto: PaymentWebhookDto,
    rawBody: string,
    signature: string | undefined,
    gateway: 'jazzcash' | 'easypaisa' | 'stripe',
  ) {
    const isValid =
      gateway === 'stripe'
        ? this.provider.verifyStripeSignatureHeader(
            rawBody,
            signature,
            this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '',
          )
        : this.provider.verifyGenericWebhookSignature(gateway, rawBody, signature);

    if (!isValid) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { transactionRef: dto.transactionRef },
    });
    if (!payment) throw new NotFoundException('Payment not found for this transaction');

    // Idempotency: a gateway may retry the same webhook — if we've
    // already processed this payment, do nothing rather than
    // re-activating/re-incrementing coupon usage a second time.
    if (payment.status !== PaymentStatus.PENDING) {
      return { alreadyProcessed: true };
    }

    if (dto.status === 'SUCCESS') {
      await this.markPaymentSuccess(payment.id);
    } else {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
    }

    return { processed: true };
  }

  // ---------- Manual confirmation (cash payments collected in person) ----------

  async manualConfirm(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment is already ${payment.status.toLowerCase()}`);
    }
    return this.markPaymentSuccess(paymentId);
  }

  // Shared success path for both the webhook and manual/cash confirmation.
  private async markPaymentSuccess(paymentId: string) {
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.SUCCESS },
    });

    if (payment.couponId) {
      await this.prisma.coupon.update({
        where: { id: payment.couponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    if (payment.enrollmentId) {
      // Reuses Phase 3's status-update logic, which already sends the
      // "Enrollment activated" notification from Phase 6 — no
      // duplicate notification code needed here.
      await this.enrollmentsService.updateStatus(payment.enrollmentId, {
        status: EnrollmentStatus.ACTIVE,
      });
    }

    return payment;
  }

  // ---------- Refunds ----------

  async refund(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('Only a successful payment can be refunded');
    }

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });

    if (payment.enrollmentId) {
      await this.enrollmentsService.updateStatus(payment.enrollmentId, {
        status: EnrollmentStatus.EXPIRED,
      });
    }

    await this.notificationsService.create(
      payment.userId,
      'Payment refunded',
      `Your payment of ${payment.amount} ${payment.currency} has been refunded. Course access has been revoked.`,
    );

    return updated;
  }

  // ---------- Reading: history, reports, invoices ----------

  async findMine(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(filters: { status?: PaymentStatus; courseId?: string }) {
    return this.prisma.payment.findMany({
      where: filters,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoice(paymentId: string, user: RequestUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true, price: true } },
        coupon: { select: { code: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (user.role !== UserRole.ADMIN && payment.userId !== user.id) {
      throw new ForbiddenException('This invoice does not belong to you');
    }

    return {
      invoiceNumber: payment.id,
      date: payment.createdAt,
      billedTo: payment.user,
      course: payment.course,
      couponApplied: payment.coupon?.code ?? null,
      amountPaid: payment.amount,
      currency: payment.currency,
      gateway: payment.gateway,
      status: payment.status,
    };
  }
}
