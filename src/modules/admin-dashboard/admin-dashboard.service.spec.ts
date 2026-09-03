import { AdminDashboardService } from './admin-dashboard.service';

function buildService() {
  const prisma = {
    user: { count: jest.fn(), findMany: jest.fn() },
    enrollment: { count: jest.fn() },
    payment: { aggregate: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    supportTicket: { count: jest.fn() },
    course: { findMany: jest.fn() },
    lesson: { findMany: jest.fn() },
    lessonProgress: { groupBy: jest.fn() },
    quizAttempt: { findMany: jest.fn() },
    assignmentSubmission: { findMany: jest.fn() },
  };
  const service = new AdminDashboardService(prisma as any);
  return { service, prisma };
}

describe('AdminDashboardService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getOverview', () => {
    it('handles a zero-revenue academy without crashing (null sum from Prisma aggregate)', async () => {
      const { service, prisma } = buildService();
      prisma.user.count.mockResolvedValue(0);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
      prisma.payment.count.mockResolvedValue(0);
      prisma.supportTicket.count.mockResolvedValue(0);

      const result = await service.getOverview();
      expect(result.totalRevenue).toBe(0);
    });

    it('converts the Decimal sum to a plain number', async () => {
      const { service, prisma } = buildService();
      prisma.user.count.mockResolvedValue(5);
      prisma.enrollment.count.mockResolvedValue(3);
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 15000 } });
      prisma.payment.count.mockResolvedValue(2);
      prisma.supportTicket.count.mockResolvedValue(1);

      const result = await service.getOverview();
      expect(result.totalRevenue).toBe(15000);
      expect(typeof result.totalRevenue).toBe('number');
    });
  });

  describe('getRevenueReport', () => {
    it('computes net revenue as gross minus refunded', async () => {
      const { service, prisma } = buildService();
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 10000 } }) // gross
        .mockResolvedValueOnce({ _sum: { amount: 1500 } }); // refunded
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.course.findMany.mockResolvedValue([]);

      const result = await service.getRevenueReport();
      expect(result.grossRevenue).toBe(10000);
      expect(result.totalRefunded).toBe(1500);
      expect(result.netRevenue).toBe(8500);
    });

    it('sorts courses by revenue descending and maps course titles correctly', async () => {
      const { service, prisma } = buildService();
      prisma.payment.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 3000 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });
      prisma.payment.groupBy.mockResolvedValue([
        { courseId: 'course-low', _sum: { amount: 1000 }, _count: { id: 2 } },
        { courseId: 'course-high', _sum: { amount: 2000 }, _count: { id: 3 } },
      ]);
      prisma.course.findMany.mockResolvedValue([
        { id: 'course-low', title: 'Chemistry' },
        { id: 'course-high', title: 'Physics' },
      ]);

      const result = await service.getRevenueReport();
      expect(result.revenueByCourse[0].courseTitle).toBe('Physics');
      expect(result.revenueByCourse[0].totalRevenue).toBe(2000);
      expect(result.revenueByCourse[1].courseTitle).toBe('Chemistry');
    });
  });

  describe('getTeacherPerformance', () => {
    it('returns null averages (not zero, not a crash) for a teacher with no courses', async () => {
      const { service, prisma } = buildService();
      prisma.user.findMany.mockResolvedValue([
        { id: 'teacher-1', fullName: 'No Courses Teacher', email: 't@x.com' },
      ]);
      prisma.course.findMany.mockResolvedValue([]);

      const result = await service.getTeacherPerformance('teacher-1');
      expect(result[0].courseCount).toBe(0);
      expect(result[0].averageQuizScore).toBeNull();
    });

    it('correctly averages quiz scores and assignment grades across all of a teacher\'s courses', async () => {
      const { service, prisma } = buildService();
      prisma.user.findMany.mockResolvedValue([
        { id: 'teacher-1', fullName: 'Busy Teacher', email: 't@x.com' },
      ]);
      prisma.course.findMany.mockResolvedValue([{ id: 'course-1' }, { id: 'course-2' }]);
      prisma.enrollment.count.mockResolvedValue(20);
      prisma.quizAttempt.findMany.mockResolvedValue([{ score: 80 }, { score: 60 }, { score: null }]);
      prisma.assignmentSubmission.findMany.mockResolvedValue([{ grade: 90 }]);

      const result = await service.getTeacherPerformance('teacher-1');
      expect(result[0].courseCount).toBe(2);
      expect(result[0].totalStudents).toBe(20);
      expect(result[0].averageQuizScore).toBe(70); // null score excluded
      expect(result[0].averageAssignmentGrade).toBe(90);
    });
  });

  describe('getContentEngagement', () => {
    it('handles zero active enrollments without dividing by zero', async () => {
      const { service, prisma } = buildService();
      prisma.lesson.findMany.mockResolvedValue([{ id: 'lesson-1', title: 'Intro', type: 'VIDEO' }]);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.lessonProgress.groupBy.mockResolvedValue([]);

      const result = await service.getContentEngagement('course-1');
      expect(result.mostWatched[0].completionRate).toBe(0);
    });

    it('correctly identifies the most-watched and lowest-completion (drop-off) lessons', async () => {
      const { service, prisma } = buildService();
      prisma.lesson.findMany.mockResolvedValue([
        { id: 'lesson-popular', title: 'Popular Lesson', type: 'VIDEO' },
        { id: 'lesson-unpopular', title: 'Unpopular Lesson', type: 'READING' },
      ]);
      prisma.enrollment.count.mockResolvedValue(10);
      prisma.lessonProgress.groupBy.mockResolvedValue([
        { lessonId: 'lesson-popular', _count: { id: 9 } },
        { lessonId: 'lesson-unpopular', _count: { id: 1 } },
      ]);

      const result = await service.getContentEngagement('course-1');
      expect(result.mostWatched[0].lessonId).toBe('lesson-popular');
      expect(result.mostWatched[0].completionRate).toBe(90);
      expect(result.dropOff[0].lessonId).toBe('lesson-unpopular');
      expect(result.dropOff[0].completionRate).toBe(10);
    });
  });
});
