import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentStatus, UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transferRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => {
      // Mimic Prisma's interactive transaction: run the callback with
      // the same mocked client acting as the transaction client.
      return cb(prisma);
    }),
  };

  const notificationsService = { create: jest.fn().mockResolvedValue({}) };

  const service = new EnrollmentsService(prisma as any, notificationsService as any);
  return { service, prisma, notificationsService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };
const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };
const TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };

describe('EnrollmentsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('enroll', () => {
    it('activates instantly for a free-trial course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        isPublished: true,
        isFreeTrial: true,
      });
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.enrollment.create.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.ACTIVE });

      await service.enroll(STUDENT.id, { courseId: 'course-1' });

      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: EnrollmentStatus.ACTIVE }) }),
      );
    });

    it('starts as PENDING for a paid course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({
        id: 'course-1',
        isPublished: true,
        isFreeTrial: false,
      });
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.enrollment.create.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.PENDING });

      await service.enroll(STUDENT.id, { courseId: 'course-1' });

      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: EnrollmentStatus.PENDING }) }),
      );
    });

    it('rejects enrolling twice in the same course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isPublished: true, isFreeTrial: false });
      prisma.enrollment.findUnique.mockResolvedValue({ id: 'existing-enrollment' });

      await expect(service.enroll(STUDENT.id, { courseId: 'course-1' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('rejects enrolling in an unpublished or missing course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue(null);

      await expect(service.enroll(STUDENT.id, { courseId: 'ghost-course' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('hasActiveAccess', () => {
    it('grants Admins access to any course', async () => {
      const { service } = buildService();
      await expect(service.hasActiveAccess(ADMIN, 'course-1')).resolves.toBe(true);
    });

    it('grants the owning Teacher access without enrollment', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: TEACHER.id, isFreeTrial: false });
      await expect(service.hasActiveAccess(TEACHER, 'course-1')).resolves.toBe(true);
    });

    it('denies a Teacher who does not own the course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: 'someone-else', isFreeTrial: false });
      prisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.hasActiveAccess(TEACHER, 'course-1')).resolves.toBe(false);
    });

    it('grants any student access to a free-trial course, enrolled or not', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: true });
      await expect(service.hasActiveAccess(STUDENT, 'course-1')).resolves.toBe(true);
    });

    it('grants access when enrollment is ACTIVE and not expired', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: false });
      prisma.enrollment.findUnique.mockResolvedValue({
        status: EnrollmentStatus.ACTIVE,
        expiresAt: null,
      });
      await expect(service.hasActiveAccess(STUDENT, 'course-1')).resolves.toBe(true);
    });

    it('denies access when enrollment is PENDING', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: false });
      prisma.enrollment.findUnique.mockResolvedValue({
        status: EnrollmentStatus.PENDING,
        expiresAt: null,
      });
      await expect(service.hasActiveAccess(STUDENT, 'course-1')).resolves.toBe(false);
    });

    it('denies access when an ACTIVE enrollment has already expired', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: false });
      prisma.enrollment.findUnique.mockResolvedValue({
        status: EnrollmentStatus.ACTIVE,
        expiresAt: new Date('2000-01-01'), // long in the past
      });
      await expect(service.hasActiveAccess(STUDENT, 'course-1')).resolves.toBe(false);
    });

    it('denies access when there is no enrollment at all', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', isFreeTrial: false });
      prisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.hasActiveAccess(STUDENT, 'course-1')).resolves.toBe(false);
    });
  });

  describe('getGatedCurriculum', () => {
    const courseWithContent = {
      id: 'course-1',
      isFreeTrial: false,
      teacherId: 'someone-else',
      subjects: [
        {
          id: 'subj-1',
          chapters: [
            {
              id: 'chap-1',
              lessons: [
                {
                  id: 'lesson-1',
                  title: 'Intro',
                  type: 'VIDEO',
                  order: 0,
                  videoUrl: 'https://real-video.mp4',
                  readingBody: null,
                  quizId: null,
                  assignmentId: null,
                },
              ],
            },
          ],
        },
      ],
    };

    it('strips lesson content and marks lessons locked when access is denied', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValueOnce(courseWithContent); // for the tree fetch
      prisma.course.findUnique.mockResolvedValueOnce(courseWithContent); // for hasActiveAccess's own lookup
      prisma.enrollment.findUnique.mockResolvedValue(null);

      const result = await service.getGatedCurriculum('course-1', STUDENT);

      expect(result.hasAccess).toBe(false);
      const lesson = result.subjects[0].chapters[0].lessons[0];
      expect(lesson.locked).toBe(true);
      expect(lesson.videoUrl).toBeNull();
    });

    it('returns full lesson content when access is granted', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValueOnce(courseWithContent);
      prisma.course.findUnique.mockResolvedValueOnce(courseWithContent);
      prisma.enrollment.findUnique.mockResolvedValue({
        status: EnrollmentStatus.ACTIVE,
        expiresAt: null,
      });

      const result = await service.getGatedCurriculum('course-1', STUDENT);

      expect(result.hasAccess).toBe(true);
      const lesson = result.subjects[0].chapters[0].lessons[0];
      expect(lesson.locked).toBe(false);
      expect(lesson.videoUrl).toBe('https://real-video.mp4');
    });
  });

  describe('updateStatus', () => {
    it('sends a notification when an enrollment transitions to ACTIVE', async () => {
      const { service, prisma, notificationsService } = buildService();
      prisma.enrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        userId: STUDENT.id,
        courseId: 'course-1',
        status: EnrollmentStatus.PENDING,
      });
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', title: '9th Class Physics' });
      prisma.enrollment.update.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.ACTIVE });

      await service.updateStatus('enr-1', { status: EnrollmentStatus.ACTIVE });

      expect(notificationsService.create).toHaveBeenCalledWith(
        STUDENT.id,
        expect.any(String),
        expect.stringContaining('9th Class Physics'),
      );
    });

    it('does NOT send a duplicate notification if the enrollment was already ACTIVE', async () => {
      const { service, prisma, notificationsService } = buildService();
      prisma.enrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        userId: STUDENT.id,
        courseId: 'course-1',
        status: EnrollmentStatus.ACTIVE, // already active
      });
      prisma.enrollment.update.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.ACTIVE });

      await service.updateStatus('enr-1', { status: EnrollmentStatus.ACTIVE });

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('does not notify when transitioning to a non-ACTIVE status', async () => {
      const { service, prisma, notificationsService } = buildService();
      prisma.enrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        userId: STUDENT.id,
        courseId: 'course-1',
        status: EnrollmentStatus.ACTIVE,
      });
      prisma.enrollment.update.mockResolvedValue({ id: 'enr-1', status: EnrollmentStatus.EXPIRED });

      await service.updateStatus('enr-1', { status: EnrollmentStatus.EXPIRED });

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('reviewTransferRequest', () => {
    const pendingRequest = {
      id: 'req-1',
      status: 'PENDING',
      enrollmentId: 'enr-1',
      requestedCourseId: 'course-2',
      enrollment: { userId: STUDENT.id, courseId: 'course-1' },
    };

    it('on approval: marks old enrollment TRANSFERRED and creates a new ACTIVE one', async () => {
      const { service, prisma } = buildService();
      prisma.transferRequest.findUnique.mockResolvedValue(pendingRequest);
      prisma.enrollment.update.mockResolvedValue({});
      prisma.enrollment.create.mockResolvedValue({});
      prisma.transferRequest.update.mockResolvedValue({ ...pendingRequest, status: 'APPROVED' });

      await service.reviewTransferRequest('req-1', 'APPROVED', ADMIN);

      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'enr-1' },
          data: { status: EnrollmentStatus.TRANSFERRED },
        }),
      );
      expect(prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: STUDENT.id,
            courseId: 'course-2',
            status: EnrollmentStatus.ACTIVE,
          }),
        }),
      );
    });

    it('on rejection: only updates the request status, never touches enrollments', async () => {
      const { service, prisma } = buildService();
      prisma.transferRequest.findUnique.mockResolvedValue(pendingRequest);
      prisma.transferRequest.update.mockResolvedValue({ ...pendingRequest, status: 'REJECTED' });

      await service.reviewTransferRequest('req-1', 'REJECTED', ADMIN);

      expect(prisma.enrollment.update).not.toHaveBeenCalled();
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
      expect(prisma.transferRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
    });

    it('rejects reviewing a request that was already decided', async () => {
      const { service, prisma } = buildService();
      prisma.transferRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'APPROVED' });

      await expect(service.reviewTransferRequest('req-1', 'APPROVED', ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
