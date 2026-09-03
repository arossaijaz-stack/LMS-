import { ForbiddenException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    assignment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    assignmentSubmission: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    lesson: { findUnique: jest.fn() },
  };
  const enrollmentsService = { hasActiveAccess: jest.fn() };
  const notificationsService = { create: jest.fn().mockResolvedValue({}) };
  const service = new AssignmentsService(prisma as any, enrollmentsService as any, notificationsService as any);
  return { service, prisma, enrollmentsService, notificationsService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

describe('AssignmentsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('submit', () => {
    it('creates a new submission on first submit', async () => {
      const { service, prisma } = buildService();
      prisma.assignment.findUnique.mockResolvedValue({ id: 'assign-1' });
      prisma.lesson.findUnique.mockResolvedValue(null); // unattached, no gating
      prisma.assignmentSubmission.findFirst.mockResolvedValue(null);
      prisma.assignmentSubmission.create.mockResolvedValue({ id: 'sub-1' });

      await service.submit('assign-1', STUDENT, 'https://files.example.com/a.pdf');

      expect(prisma.assignmentSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assignmentId: 'assign-1', userId: STUDENT.id, fileUrl: 'https://files.example.com/a.pdf' },
        }),
      );
    });

    it('overwrites the previous submission on resubmit, resetting any prior grade', async () => {
      const { service, prisma } = buildService();
      prisma.assignment.findUnique.mockResolvedValue({ id: 'assign-1' });
      prisma.lesson.findUnique.mockResolvedValue(null);
      prisma.assignmentSubmission.findFirst.mockResolvedValue({
        id: 'existing-sub',
        grade: 85,
        feedback: 'Good job',
      });
      prisma.assignmentSubmission.update.mockResolvedValue({ id: 'existing-sub' });

      await service.submit('assign-1', STUDENT, 'https://files.example.com/v2.pdf');

      expect(prisma.assignmentSubmission.create).not.toHaveBeenCalled();
      expect(prisma.assignmentSubmission.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-sub' },
          data: expect.objectContaining({
            fileUrl: 'https://files.example.com/v2.pdf',
            grade: null, // old grade must not survive a resubmission
            feedback: null,
          }),
        }),
      );
    });

    it('blocks submission when the assignment is course-gated and the student lacks access', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.assignment.findUnique.mockResolvedValue({ id: 'assign-1' });
      prisma.lesson.findUnique.mockResolvedValue({
        chapter: { subject: { courseId: 'course-1' } },
      });
      enrollmentsService.hasActiveAccess.mockResolvedValue(false);

      await expect(
        service.submit('assign-1', STUDENT, 'https://files.example.com/a.pdf'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.assignmentSubmission.create).not.toHaveBeenCalled();
    });

    it('allows a Teacher/Admin to submit regardless of enrollment (e.g. testing the flow)', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      const TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };
      prisma.assignment.findUnique.mockResolvedValue({ id: 'assign-1' });
      prisma.assignmentSubmission.findFirst.mockResolvedValue(null);
      prisma.assignmentSubmission.create.mockResolvedValue({ id: 'sub-1' });

      await service.submit('assign-1', TEACHER, 'https://files.example.com/a.pdf');

      expect(prisma.lesson.findUnique).not.toHaveBeenCalled(); // short-circuited before the lookup
      expect(enrollmentsService.hasActiveAccess).not.toHaveBeenCalled();
      expect(prisma.assignmentSubmission.create).toHaveBeenCalled();
    });
  });

  describe('gradeSubmission', () => {
    it('sets grade and feedback on an existing submission', async () => {
      const { service, prisma } = buildService();
      prisma.assignmentSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: STUDENT.id,
        assignment: { title: 'Essay 1' },
      });
      prisma.assignmentSubmission.update.mockResolvedValue({ id: 'sub-1', grade: 90 });

      const result = await service.gradeSubmission('sub-1', { grade: 90, feedback: 'Well done' });
      expect(result.grade).toBe(90);
    });

    it('notifies the student when their submission is graded', async () => {
      const { service, prisma, notificationsService } = buildService();
      prisma.assignmentSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: STUDENT.id,
        assignment: { title: 'Essay 1' },
      });
      prisma.assignmentSubmission.update.mockResolvedValue({ id: 'sub-1', grade: 90 });

      await service.gradeSubmission('sub-1', { grade: 90, feedback: 'Well done' });

      expect(notificationsService.create).toHaveBeenCalledWith(
        STUDENT.id,
        expect.any(String),
        expect.stringContaining('Essay 1'),
      );
    });
  });
});
