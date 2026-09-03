import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { EnrollmentStatus, PaymentStatus, UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: { findUnique: jest.fn(), create: jest.fn() },
    payment: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    coupon: { update: jest.fn() },
  };
  const couponsService = { validateForCheckout: jest.fn() };
  const provider = {
    createCheckoutSession: jest.fn().mockResolvedValue({
      providerRef: 'ref-123',
      checkoutUrl: 'https://gateway.example.com/pay/ref-123',
    }),
    verifyGenericWebhookSignature: jest.fn().mockReturnValue(true),
    verifyStripeSignatureHeader: jest.fn().mockReturnValue(true),
  };
  const enrollmentsService = { updateStatus: jest.fn().mockResolvedValue({}) };
  const notificationsService = { create: jest.fn().mockResolvedValue({}) };
  const config = { get: jest.fn().mockReturnValue('test-secret') };

  const service = new PaymentsService(
    prisma as any,
    couponsService as any,
    provider as any,
    enrollmentsService as any,
    notificationsService as any,
    config as any,
  );
  return { service, prisma, couponsService, provider, enrollmentsService, notificationsService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

describe('PaymentsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('checkout', () => {
    it('rejects checkout for a free-trial course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isPublished: true, isFreeTrial: true });

      await expect(
        service.checkout(STUDENT, { courseId: 'course-1', gateway: 'jazzcash' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects checkout when the student is already ACTIVE-enrolled', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isPublished: true, isFreeTrial: false, price: 1000 });
      prisma.enrollment.findUnique.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.ACTIVE });

      await expect(
        service.checkout(STUDENT, { courseId: 'course-1', gateway: 'jazzcash' as any }),
      ).rejects.toThrow(ConflictException);
    });

    it('reuses an existing PENDING enrollment instead of creating a duplicate', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isPublished: true, isFreeTrial: false, price: 1000, title: 'Physics' });
      prisma.enrollment.findUnique.mockResolvedValue({ id: 'existing-enr', status: EnrollmentStatus.PENDING });
      prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1' });

      await service.checkout(STUDENT, { courseId: 'course-1', gateway: 'jazzcash' as any });

      expect(prisma.enrollment.create).not.toHaveBeenCalled();
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ enrollmentId: 'existing-enr' }) }),
      );
    });

    it('applies a valid coupon and charges the discounted amount', async () => {
      const { service, prisma, couponsService } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isPublished: true, isFreeTrial: false, price: 1000, title: 'Physics' });
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.enrollment.create.mockResolvedValue({ id: 'new-enr' });
      couponsService.validateForCheckout.mockResolvedValue({
        coupon: { id: 'coupon-1' },
        finalAmount: 800,
        discountApplied: 200,
      });
      prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1' });

      const result = await service.checkout(STUDENT, {
        courseId: 'course-1',
        gateway: 'jazzcash' as any,
        couponCode: 'SAVE20',
      });

      expect(result.amount).toBe(800);
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 800, couponId: 'coupon-1' }) }),
      );
    });

    it('creates a payment with the full price when no coupon is used', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isPublished: true, isFreeTrial: false, price: 1000, title: 'Physics' });
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.enrollment.create.mockResolvedValue({ id: 'new-enr' });
      prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1' });

      const result = await service.checkout(STUDENT, { courseId: 'course-1', gateway: 'stripe' as any });
      expect(result.amount).toBe(1000);
    });
  });

  describe('handleWebhook', () => {
    it('rejects a jazzcash/easypaisa webhook with an invalid signature', async () => {
      const { service, provider } = buildService();
      provider.verifyGenericWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(
          { gateway: 'jazzcash' as any, transactionRef: 'ref-1', status: 'SUCCESS' },
          'raw-body',
          'bad-sig',
          'jazzcash',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a stripe webhook with an invalid signature via the Stripe-specific verifier', async () => {
      const { service, provider } = buildService();
      provider.verifyStripeSignatureHeader.mockReturnValue(false);

      await expect(
        service.handleWebhook(
          { gateway: 'stripe' as any, transactionRef: 'ref-1', status: 'SUCCESS' },
          'raw-body',
          't=123,v1=bad',
          'stripe',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(provider.verifyStripeSignatureHeader).toHaveBeenCalled();
      expect(provider.verifyGenericWebhookSignature).not.toHaveBeenCalled();
    });

    it('activates the enrollment and increments coupon usage on a successful payment', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        status: PaymentStatus.PENDING,
        enrollmentId: 'enr-1',
        couponId: 'coupon-1',
      });
      prisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        status: PaymentStatus.SUCCESS,
        enrollmentId: 'enr-1',
        couponId: 'coupon-1',
      });

      await service.handleWebhook(
        { gateway: 'jazzcash' as any, transactionRef: 'ref-1', status: 'SUCCESS' },
        'raw-body',
        'sig',
        'jazzcash',
      );

      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { usedCount: { increment: 1 } },
      });
      expect(enrollmentsService.updateStatus).toHaveBeenCalledWith('enr-1', {
        status: EnrollmentStatus.ACTIVE,
      });
    });

    it('is idempotent — a retried webhook for an already-processed payment does nothing twice', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        status: PaymentStatus.SUCCESS, // already processed
        enrollmentId: 'enr-1',
      });

      const result = await service.handleWebhook(
        { gateway: 'jazzcash' as any, transactionRef: 'ref-1', status: 'SUCCESS' },
        'raw-body',
        'sig',
        'jazzcash',
      );

      expect(result.alreadyProcessed).toBe(true);
      expect(enrollmentsService.updateStatus).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('marks the payment FAILED without touching the enrollment on a failed payment', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.PENDING, enrollmentId: 'enr-1' });

      await service.handleWebhook(
        { gateway: 'jazzcash' as any, transactionRef: 'ref-1', status: 'FAILED' },
        'raw-body',
        'sig',
        'jazzcash',
      );

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.FAILED },
      });
      expect(enrollmentsService.updateStatus).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown transaction reference', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.handleWebhook(
          { gateway: 'jazzcash' as any, transactionRef: 'unknown-ref', status: 'SUCCESS' },
          'raw-body',
          'sig',
          'jazzcash',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('manualConfirm', () => {
    it('rejects confirming a payment that is not PENDING', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.SUCCESS });

      await expect(service.manualConfirm('pay-1')).rejects.toThrow(BadRequestException);
    });

    it('activates enrollment for a valid cash-payment confirmation', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.PENDING });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.SUCCESS, enrollmentId: 'enr-1', couponId: null });

      await service.manualConfirm('pay-1');
      expect(enrollmentsService.updateStatus).toHaveBeenCalledWith('enr-1', { status: EnrollmentStatus.ACTIVE });
    });
  });

  describe('refund', () => {
    it('rejects refunding a payment that was never successful', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.PENDING });

      await expect(service.refund('pay-1')).rejects.toThrow(BadRequestException);
    });

    it('revokes course access and notifies the student on a successful refund', async () => {
      const { service, prisma, enrollmentsService, notificationsService } = buildService();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        status: PaymentStatus.SUCCESS,
        enrollmentId: 'enr-1',
        userId: STUDENT.id,
        amount: 1000,
        currency: 'PKR',
      });
      prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.REFUNDED });

      await service.refund('pay-1');

      expect(enrollmentsService.updateStatus).toHaveBeenCalledWith('enr-1', {
        status: EnrollmentStatus.EXPIRED,
      });
      expect(notificationsService.create).toHaveBeenCalled();
    });
  });

  describe('getInvoice', () => {
    it('blocks a student from viewing someone else\'s invoice', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', userId: 'someone-else' });

      await expect(service.getInvoice('pay-1', STUDENT)).rejects.toThrow(ForbiddenException);
    });

    it('allows the payment owner to view their own invoice', async () => {
      const { service, prisma } = buildService();
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        userId: STUDENT.id,
        user: { id: STUDENT.id, fullName: 'Ali' },
        course: { id: 'course-1', title: 'Physics', price: 1000 },
        coupon: null,
        amount: 800,
        currency: 'PKR',
        gateway: 'jazzcash',
        status: PaymentStatus.SUCCESS,
        createdAt: new Date(),
      });

      const invoice = await service.getInvoice('pay-1', STUDENT);
      expect(invoice.amountPaid).toBe(800);
    });
  });
});
