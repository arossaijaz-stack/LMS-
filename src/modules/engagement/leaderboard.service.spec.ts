import { ForbiddenException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: { findMany: jest.fn() },
    quizAttempt: { findMany: jest.fn() },
  };
  const enrollmentsService = { hasActiveAccess: jest.fn() };
  const service = new LeaderboardService(prisma as any, enrollmentsService as any);
  return { service, prisma, enrollmentsService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };
const TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };

describe('LeaderboardService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks a non-enrolled student from viewing the leaderboard', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    enrollmentsService.hasActiveAccess.mockResolvedValue(false);

    await expect(service.getCourseLeaderboard('course-1', STUDENT)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets staff view the leaderboard without an enrollment check', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    prisma.enrollment.findMany.mockResolvedValue([]);
    prisma.quizAttempt.findMany.mockResolvedValue([]);

    await service.getCourseLeaderboard('course-1', TEACHER);
    expect(enrollmentsService.hasActiveAccess).not.toHaveBeenCalled();
  });

  it('ranks students by average score, highest first', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    enrollmentsService.hasActiveAccess.mockResolvedValue(true);
    prisma.enrollment.findMany.mockResolvedValue([
      { userId: 'student-a', user: { id: 'student-a', fullName: 'Student A', avatarUrl: null } },
      { userId: 'student-b', user: { id: 'student-b', fullName: 'Student B', avatarUrl: null } },
    ]);
    prisma.quizAttempt.findMany.mockResolvedValue([
      { userId: 'student-a', score: 60 },
      { userId: 'student-b', score: 90 },
    ]);

    const result = await service.getCourseLeaderboard('course-1', STUDENT);
    expect(result[0].userId).toBe('student-b');
    expect(result[0].rank).toBe(1);
    expect(result[1].userId).toBe('student-a');
    expect(result[1].rank).toBe(2);
  });

  it('sorts students with no quiz attempts to the bottom, not treated as a score of 0', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    enrollmentsService.hasActiveAccess.mockResolvedValue(true);
    prisma.enrollment.findMany.mockResolvedValue([
      { userId: 'has-attempted', user: { id: 'has-attempted', fullName: 'Tried', avatarUrl: null } },
      { userId: 'never-attempted', user: { id: 'never-attempted', fullName: 'Never', avatarUrl: null } },
    ]);
    // Deliberately give the attempted student a LOW score (20) to prove
    // the never-attempted student still ranks below them, not above.
    prisma.quizAttempt.findMany.mockResolvedValue([{ userId: 'has-attempted', score: 20 }]);

    const result = await service.getCourseLeaderboard('course-1', STUDENT);
    expect(result[0].userId).toBe('has-attempted');
    expect(result[0].averageScore).toBe(20);
    expect(result[1].userId).toBe('never-attempted');
    expect(result[1].averageScore).toBeNull();
  });

  it('averages multiple attempts per student correctly', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1' });
    enrollmentsService.hasActiveAccess.mockResolvedValue(true);
    prisma.enrollment.findMany.mockResolvedValue([
      { userId: 'student-a', user: { id: 'student-a', fullName: 'A', avatarUrl: null } },
    ]);
    prisma.quizAttempt.findMany.mockResolvedValue([
      { userId: 'student-a', score: 100 },
      { userId: 'student-a', score: 50 },
    ]);

    const result = await service.getCourseLeaderboard('course-1', STUDENT);
    expect(result[0].averageScore).toBe(75);
    expect(result[0].quizzesTaken).toBe(2);
  });
});
