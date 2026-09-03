import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class LeaderboardService {
  constructor(
    private prisma: PrismaService,
    private enrollmentsService: EnrollmentsService,
  ) {}

  // Ranking metric (v1): average score across all quiz attempts for
  // quizzes attached to this course's lessons. This is a deliberate
  // simplification — flagged in the Phase 6 README — since a real
  // academy will likely want a configurable formula (progress % +
  // quiz average + attendance, weighted differently per program).
  // That configurability naturally belongs in Phase 9's theming/config
  // engine; this gives a working v1 in the meantime.
  async getCourseLeaderboard(courseId: string, user: RequestUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const isStaff = user.role === UserRole.ADMIN || user.role === UserRole.TEACHER;
    if (!isStaff) {
      const hasAccess = await this.enrollmentsService.hasActiveAccess(user, courseId);
      if (!hasAccess) {
        throw new ForbiddenException('Enroll in this course to view its leaderboard');
      }
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: 'ACTIVE' },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        userId: { in: enrollments.map((e) => e.userId) },
        quiz: { lesson: { chapter: { subject: { courseId } } } },
      },
      select: { userId: true, score: true },
    });

    const scoresByUser = new Map<string, number[]>();
    for (const attempt of attempts) {
      if (attempt.score === null || attempt.score === undefined) continue;
      const list = scoresByUser.get(attempt.userId) ?? [];
      list.push(Number(attempt.score));
      scoresByUser.set(attempt.userId, list);
    }

    const leaderboard = enrollments.map((e) => {
      const scores = scoresByUser.get(e.userId) ?? [];
      const averageScore =
        scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
      return {
        userId: e.userId,
        fullName: e.user.fullName,
        avatarUrl: e.user.avatarUrl,
        averageScore,
        quizzesTaken: scores.length,
      };
    });

    // Students with no attempts yet sort to the bottom (null last),
    // not treated as a score of 0 — a 0 would unfairly rank someone who
    // scored genuinely badly the same as someone who hasn't tried yet.
    leaderboard.sort((a, b) => {
      if (a.averageScore === null && b.averageScore === null) return 0;
      if (a.averageScore === null) return 1;
      if (b.averageScore === null) return -1;
      return b.averageScore - a.averageScore;
    });

    return leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));
  }
}
