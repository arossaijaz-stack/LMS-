// These tests are different from every other *.spec.ts file in this
// project: instead of mocking the services a given service depends on,
// they instantiate REAL instances of multiple services and wire them
// together exactly as NestJS's DI container would — only PrismaService
// is faked (with a shared in-memory-ish jest.fn() mock). This proves
// the actual call contracts between services genuinely match (e.g.
// PaymentsService really does call EnrollmentsService.updateStatus with
// the right shape, and that really does call NotificationsService.create
// correctly) — something per-module unit tests can't catch, since they
// mock those calls away entirely.
//
// This is the closest this sandboxed environment can get to a true
// end-to-end test without a live database (see every prior phase's
// README for why: Prisma's query engine binary download is blocked by
// this environment's network policy). It is still not a substitute for
// running the full HTTP + real Postgres path — see PHASE10-README.md.

import { EnrollmentsService } from '../modules/enrollments/enrollments.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { CouponsService } from '../modules/coupons/coupons.service';
import { PaymentsService } from '../modules/payments/payments.service';
import { PaymentProviderService } from '../modules/payments/payment-provider.service';
import { QuizzesService } from '../modules/quizzes/quizzes.service';
import { EnrollmentStatus, PaymentStatus, UserRole } from '@prisma/client';

function buildSharedPrismaMock() {
  return {
    course: { findUnique: jest.fn() },
    enrollment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    coupon: { update: jest.fn() },
    notification: { create: jest.fn() },
    lesson: { findUnique: jest.fn() },
    quiz: { findUnique: jest.fn() },
  };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

describe('Critical path: checkout → webhook → enrollment activation → notification', () => {
  it('wires PaymentsService → EnrollmentsService → NotificationsService correctly, end to end, with real (non-mocked) service instances', async () => {
    const prisma = buildSharedPrismaMock();

    // Only these two are genuinely faked — everything else is real.
    const config = {
      get: jest.fn((key: string) => (key === 'STRIPE_WEBHOOK_SECRET' ? 'test-secret' : undefined)),
    };
    const provider = new PaymentProviderService(config as any);
    jest.spyOn(provider, 'verifyGenericWebhookSignature').mockReturnValue(true);
    jest.spyOn(provider, 'createCheckoutSession').mockResolvedValue({
      providerRef: 'ref-integration-test' as any,
      checkoutUrl: 'https://gateway.example.com/pay/ref-integration-test',
      note: 'mock',
    });

    // Real instances, real constructors, real cross-service calls:
    const notificationsService = new NotificationsService(prisma as any);
    const enrollmentsService = new EnrollmentsService(prisma as any, notificationsService);
    const couponsService = new CouponsService(prisma as any);
    const paymentsService = new PaymentsService(
      prisma as any,
      couponsService,
      provider,
      enrollmentsService, // REAL — not a mock with a fake updateStatus
      notificationsService, // REAL — not a mock with a fake create
      config as any,
    );

    // ---- Step 1: student checks out for a paid course ----
    prisma.course.findUnique.mockResolvedValue({
      id: 'course-1',
      title: 'Physics 101',
      isPublished: true,
      isFreeTrial: false,
      price: 2500,
    });
    prisma.enrollment.findUnique.mockResolvedValueOnce(null); // no existing enrollment yet
    prisma.enrollment.create.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.PENDING });
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    prisma.payment.update.mockResolvedValue({ id: 'pay-1', transactionRef: 'ref-integration-test' });

    const checkoutResult = await paymentsService.checkout(STUDENT, {
      courseId: 'course-1',
      gateway: 'jazzcash' as any,
    });

    expect(checkoutResult.checkoutUrl).toContain('ref-integration-test');
    expect(prisma.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: EnrollmentStatus.PENDING }) }),
    );

    // ---- Step 2: payment gateway sends the success webhook ----
    prisma.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.PENDING,
      enrollmentId: 'enr-1',
      couponId: null,
    });
    // IMPORTANT: payment.update must be re-mocked here with a value that
    // includes enrollmentId/couponId — markPaymentSuccess() reads those
    // fields off whatever payment.update() returns to decide whether to
    // activate the enrollment. Reusing the earlier checkout-step mock
    // (which only had {id, transactionRef}) was the actual bug that
    // caused this test to fail on the first attempt: enrollmentId came
    // back undefined, so the real code correctly (and silently) skipped
    // calling enrollmentsService.updateStatus — a test setup bug, not a
    // service bug, but a good reminder of how easy this class of mistake
    // is to make with chained mocks across a multi-step flow.
    prisma.payment.update.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.SUCCESS,
      enrollmentId: 'enr-1',
      couponId: null,
    });
    // This is the REAL EnrollmentsService.updateStatus running — it will
    // internally call prisma.enrollment.findUnique (to check the current
    // status before deciding whether to notify) and prisma.enrollment.update.
    prisma.enrollment.findUnique.mockResolvedValueOnce({
      id: 'enr-1',
      userId: STUDENT.id,
      courseId: 'course-1',
      status: EnrollmentStatus.PENDING, // it's about to transition to ACTIVE
    });
    prisma.enrollment.update.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.ACTIVE });
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', title: 'Physics 101' });

    const webhookResult = await paymentsService.handleWebhook(
      { gateway: 'jazzcash' as any, transactionRef: 'ref-integration-test', status: 'SUCCESS' },
      'raw-body',
      'valid-sig',
      'jazzcash',
    );

    expect(webhookResult.processed).toBe(true);

    // ---- Assert the FULL real chain fired correctly ----
    // Proves PaymentsService really called the REAL EnrollmentsService,
    // which really called prisma.enrollment.update with ACTIVE status...
    expect(prisma.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'enr-1' }, data: { status: EnrollmentStatus.ACTIVE } }),
    );
    // ...which really called the REAL NotificationsService, which really
    // called prisma.notification.create — three real service instances,
    // two real cross-service calls, verified in one flow.
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: STUDENT.id,
          title: expect.stringContaining('activated'),
        }),
      }),
    );
  });
});

describe('Critical path: enrollment activation unlocks gated quiz content', () => {
  it('a student who is ACTIVE via the real EnrollmentsService can take a course-attached quiz via the real QuizzesService', async () => {
    const prisma = buildSharedPrismaMock();
    const notificationsService = new NotificationsService(prisma as any);
    const enrollmentsService = new EnrollmentsService(prisma as any, notificationsService);
    const quizzesService = new QuizzesService(prisma as any, enrollmentsService); // REAL EnrollmentsService injected

    // Quiz is attached to a lesson which belongs to course-1.
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      title: 'Chapter 1 Quiz',
      timeLimitMin: 10,
      randomize: false,
      questions: [],
    });
    prisma.lesson.findUnique.mockResolvedValue({
      chapter: { subject: { courseId: 'course-1' } },
    });
    // The REAL hasActiveAccess will look this up:
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: false, teacherId: null });
    prisma.enrollment.findUnique.mockResolvedValue({
      status: EnrollmentStatus.ACTIVE,
      expiresAt: null,
    });

    const result = await quizzesService.getQuizForStudent('quiz-1', STUDENT);
    expect(result.title).toBe('Chapter 1 Quiz');
  });

  it('a PENDING (unpaid) student is correctly blocked by the real EnrollmentsService via the real QuizzesService', async () => {
    const prisma = buildSharedPrismaMock();
    const notificationsService = new NotificationsService(prisma as any);
    const enrollmentsService = new EnrollmentsService(prisma as any, notificationsService);
    const quizzesService = new QuizzesService(prisma as any, enrollmentsService);

    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      title: 'Chapter 1 Quiz',
      timeLimitMin: 10,
      randomize: false,
      questions: [],
    });
    prisma.lesson.findUnique.mockResolvedValue({
      chapter: { subject: { courseId: 'course-1' } },
    });
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: false, teacherId: null });
    prisma.enrollment.findUnique.mockResolvedValue({
      status: EnrollmentStatus.PENDING, // hasn't paid yet
      expiresAt: null,
    });

    await expect(quizzesService.getQuizForStudent('quiz-1', STUDENT)).rejects.toThrow();
  });
});
