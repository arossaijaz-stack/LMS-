import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private enrollmentsService: EnrollmentsService,
  ) {}

  // ---------- Lesson completion ----------

  async markComplete(lessonId: string, user: RequestUser) {
    await this.assertLessonAccess(lessonId, user);
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      create: { userId: user.id, lessonId, completed: true, completedAt: new Date() },
      update: { completed: true, completedAt: new Date() },
    });
  }

  async markIncomplete(lessonId: string, user: RequestUser) {
    await this.assertLessonAccess(lessonId, user);
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      create: { userId: user.id, lessonId, completed: false },
      update: { completed: false, completedAt: null },
    });
  }

  // ---------- Course progress % ----------

  async getCourseProgress(courseId: string, user: RequestUser) {
    const totalLessons = await this.prisma.lesson.count({
      where: { chapter: { subject: { courseId } } },
    });

    if (totalLessons === 0) {
      return { totalLessons: 0, completedLessons: 0, percent: 0 };
    }

    const completedLessons = await this.prisma.lessonProgress.count({
      where: {
        userId: user.id,
        completed: true,
        lesson: { chapter: { subject: { courseId } } },
      },
    });

    return {
      totalLessons,
      completedLessons,
      percent: Math.round((completedLessons / totalLessons) * 100),
    };
  }

  // ---------- Student stats dashboard ----------

  async getMyStats(userId: string) {
    const [enrollmentCount, quizAttempts, gradedSubmissions, completedLessons] = await Promise.all([
      this.prisma.enrollment.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.quizAttempt.findMany({ where: { userId }, select: { score: true } }),
      this.prisma.assignmentSubmission.findMany({
        where: { userId, grade: { not: null } },
        select: { grade: true },
      }),
      this.prisma.lessonProgress.count({ where: { userId, completed: true } }),
    ]);

    const objectiveScores = quizAttempts
      .map((a) => a.score)
      .filter((s): s is any => s !== null && s !== undefined);
    const avgQuizScore =
      objectiveScores.length > 0
        ? Math.round(
            objectiveScores.reduce((sum: number, s: any) => sum + Number(s), 0) / objectiveScores.length,
          )
        : null;

    const avgAssignmentGrade =
      gradedSubmissions.length > 0
        ? Math.round(
            gradedSubmissions.reduce((sum, s) => sum + Number(s.grade), 0) / gradedSubmissions.length,
          )
        : null;

    return {
      activeEnrollments: enrollmentCount,
      lessonsCompleted: completedLessons,
      quizzesTaken: quizAttempts.length,
      averageQuizScore: avgQuizScore,
      assignmentsGraded: gradedSubmissions.length,
      averageAssignmentGrade: avgAssignmentGrade,
    };
  }

  // ---------- Access gating ----------

  private async assertLessonAccess(lessonId: string, user: RequestUser) {
    if (user.role === UserRole.ADMIN) return;

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { include: { subject: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const hasAccess = await this.enrollmentsService.hasActiveAccess(
      user,
      lesson.chapter.subject.courseId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('Enroll in this course to track progress on this lesson');
    }
  }
}
