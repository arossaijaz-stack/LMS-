import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, PaymentStatus, TicketStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private prisma: PrismaService) {}

  // ---------- Central overview ----------

  async getOverview() {
    const [
      totalStudents,
      totalTeachers,
      activeEnrollments,
      pendingEnrollments,
      revenueAgg,
      pendingPayments,
      openTickets,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.STUDENT } }),
      this.prisma.user.count({ where: { role: UserRole.TEACHER } }),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.ACTIVE } }),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.PENDING } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.OPEN } }),
    ]);

    return {
      totalStudents,
      totalTeachers,
      activeEnrollments,
      pendingEnrollments,
      totalRevenue: Number(revenueAgg._sum.amount ?? 0),
      pendingPayments,
      openTickets,
    };
  }

  // ---------- Financial reports ----------

  async getRevenueReport() {
    const [totalSuccess, totalRefunded, byCourse] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.REFUNDED },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['courseId'],
        where: { status: PaymentStatus.SUCCESS, courseId: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const courseIds = byCourse.map((row) => row.courseId).filter((id): id is string => !!id);
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true },
    });
    const courseTitleById = new Map(courses.map((c) => [c.id, c.title]));

    const revenueByCourse = byCourse
      .map((row) => ({
        courseId: row.courseId,
        courseTitle: courseTitleById.get(row.courseId!) ?? 'Unknown course',
        totalRevenue: Number(row._sum.amount ?? 0),
        paymentCount: row._count.id,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      grossRevenue: Number(totalSuccess._sum.amount ?? 0),
      totalRefunded: Number(totalRefunded._sum.amount ?? 0),
      netRevenue: Number(totalSuccess._sum.amount ?? 0) - Number(totalRefunded._sum.amount ?? 0),
      revenueByCourse,
    };
  }

  // ---------- Teacher performance ----------

  async getTeacherPerformance(teacherId?: string) {
    const teachers = await this.prisma.user.findMany({
      where: { role: UserRole.TEACHER, id: teacherId },
      select: { id: true, fullName: true, email: true },
    });

    return Promise.all(teachers.map((teacher) => this.buildTeacherStats(teacher)));
  }

  private async buildTeacherStats(teacher: { id: string; fullName: string; email: string }) {
    const courses = await this.prisma.course.findMany({
      where: { teacherId: teacher.id },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    if (courseIds.length === 0) {
      return {
        teacherId: teacher.id,
        fullName: teacher.fullName,
        courseCount: 0,
        totalStudents: 0,
        averageQuizScore: null,
        averageAssignmentGrade: null,
      };
    }

    const [totalStudents, quizAttempts, gradedSubmissions] = await Promise.all([
      this.prisma.enrollment.count({
        where: { courseId: { in: courseIds }, status: EnrollmentStatus.ACTIVE },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quiz: { lesson: { chapter: { subject: { courseId: { in: courseIds } } } } } },
        select: { score: true },
      }),
      this.prisma.assignmentSubmission.findMany({
        where: {
          grade: { not: null },
          assignment: { lesson: { chapter: { subject: { courseId: { in: courseIds } } } } },
        },
        select: { grade: true },
      }),
    ]);

    const scores = quizAttempts.map((a) => a.score).filter((s): s is any => s !== null);
    const averageQuizScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum: number, s: any) => sum + Number(s), 0) / scores.length)
        : null;

    const averageAssignmentGrade =
      gradedSubmissions.length > 0
        ? Math.round(
            gradedSubmissions.reduce((sum, s) => sum + Number(s.grade), 0) / gradedSubmissions.length,
          )
        : null;

    return {
      teacherId: teacher.id,
      fullName: teacher.fullName,
      courseCount: courseIds.length,
      totalStudents,
      averageQuizScore,
      averageAssignmentGrade,
    };
  }

  // ---------- Content engagement (most-watched / drop-off) ----------

  async getContentEngagement(courseId: string) {
    const [lessons, activeEnrollmentCount] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { chapter: { subject: { courseId } } },
        select: {
          id: true,
          title: true,
          type: true,
        },
      }),
      this.prisma.enrollment.count({ where: { courseId, status: EnrollmentStatus.ACTIVE } }),
    ]);

    const completionCounts = await this.prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      where: { completed: true, lesson: { chapter: { subject: { courseId } } } },
      _count: { id: true },
    });
    const completionByLesson = new Map<string, number>(
      completionCounts.map((row) => [row.lessonId, row._count.id]),
    );

    const engagement = lessons.map((lesson) => {
      const completedCount = completionByLesson.get(lesson.id) ?? 0;
      const completionRate =
        activeEnrollmentCount > 0 ? Math.round((completedCount / activeEnrollmentCount) * 100) : 0;
      return {
        lessonId: lesson.id,
        title: lesson.title,
        type: lesson.type,
        completedCount,
        completionRate,
      };
    });

    return {
      activeEnrollmentCount,
      mostWatched: [...engagement].sort((a, b) => b.completedCount - a.completedCount).slice(0, 10),
      dropOff: [...engagement].sort((a, b) => a.completionRate - b.completionRate).slice(0, 10),
    };
  }
}
