import { ForbiddenException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    lesson: { findUnique: jest.fn(), count: jest.fn() },
    lessonProgress: { upsert: jest.fn(), count: jest.fn() },
    enrollment: { count: jest.fn() },
    quizAttempt: { findMany: jest.fn() },
    assignmentSubmission: { findMany: jest.fn() },
  };
  const enrollmentsService = { hasActiveAccess: jest.fn() };
  const service = new ProgressService(prisma as any, enrollmentsService as any);
  return { service, prisma, enrollmentsService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

describe('ProgressService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('markComplete', () => {
    it('rejects marking a lesson complete when the student lacks access', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1',
        chapter: { subject: { courseId: 'course-1' } },
      });
      enrollmentsService.hasActiveAccess.mockResolvedValue(false);

      await expect(service.markComplete('lesson-1', STUDENT)).rejects.toThrow(ForbiddenException);
      expect(prisma.lessonProgress.upsert).not.toHaveBeenCalled();
    });

    it('upserts a completed=true record when access is granted', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1',
        chapter: { subject: { courseId: 'course-1' } },
      });
      enrollmentsService.hasActiveAccess.mockResolvedValue(true);
      prisma.lessonProgress.upsert.mockResolvedValue({ completed: true });

      await service.markComplete('lesson-1', STUDENT);

      const callArgs = prisma.lessonProgress.upsert.mock.calls[0][0];
      expect(callArgs.update.completed).toBe(true);
      expect(callArgs.create.completed).toBe(true);
    });
  });

  describe('getCourseProgress', () => {
    it('returns 0% for a course with zero lessons, without dividing by zero', async () => {
      const { service, prisma } = buildService();
      prisma.lesson.count.mockResolvedValue(0);

      const result = await service.getCourseProgress('course-1', STUDENT);
      expect(result.percent).toBe(0);
      expect(prisma.lessonProgress.count).not.toHaveBeenCalled();
    });

    it('calculates the correct percentage', async () => {
      const { service, prisma } = buildService();
      prisma.lesson.count.mockResolvedValue(10);
      prisma.lessonProgress.count.mockResolvedValue(3);

      const result = await service.getCourseProgress('course-1', STUDENT);
      expect(result.percent).toBe(30);
      expect(result.totalLessons).toBe(10);
      expect(result.completedLessons).toBe(3);
    });
  });

  describe('getMyStats', () => {
    it('computes averages correctly and returns null averages when there is no data yet', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.count.mockResolvedValue(2);
      prisma.quizAttempt.findMany.mockResolvedValue([]);
      prisma.assignmentSubmission.findMany.mockResolvedValue([]);
      prisma.lessonProgress.count.mockResolvedValue(0);

      const result = await service.getMyStats(STUDENT.id);
      expect(result.averageQuizScore).toBeNull();
      expect(result.averageAssignmentGrade).toBeNull();
    });

    it('averages quiz scores and assignment grades correctly, ignoring null scores', async () => {
      const { service, prisma } = buildService();
      prisma.enrollment.count.mockResolvedValue(1);
      prisma.quizAttempt.findMany.mockResolvedValue([
        { score: 80 },
        { score: 60 },
        { score: null }, // an attempt with only open-ended questions — should be excluded
      ]);
      prisma.assignmentSubmission.findMany.mockResolvedValue([{ grade: 90 }, { grade: 70 }]);
      prisma.lessonProgress.count.mockResolvedValue(5);

      const result = await service.getMyStats(STUDENT.id);
      expect(result.averageQuizScore).toBe(70); // (80+60)/2, null excluded
      expect(result.averageAssignmentGrade).toBe(80); // (90+70)/2
      expect(result.lessonsCompleted).toBe(5);
    });
  });
});
