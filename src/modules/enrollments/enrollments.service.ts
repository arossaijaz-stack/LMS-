import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentStatusDto,
  CreateTransferRequestDto,
} from './dto/enrollment.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class EnrollmentsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  // ---------- Enrolling ----------

  // Self-service enroll. For a free-trial course this activates instantly.
  // For a paid course, this creates a PENDING enrollment — Phase 7
  // (Payments) will flip it to ACTIVE once payment succeeds. Until
  // Phase 7 exists, an Admin/Campus Manager can also manually activate
  // via updateStatus() below (useful for cash payments collected in person,
  // which KIPS-style academies commonly support alongside online payment).
  async enroll(userId: string, dto: CreateEnrollmentDto) {
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found');
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: dto.courseId } },
    });
    if (existing) {
      throw new ConflictException('You are already enrolled in this course');
    }

    return this.prisma.enrollment.create({
      data: {
        userId,
        courseId: dto.courseId,
        status: course.isFreeTrial ? EnrollmentStatus.ACTIVE : EnrollmentStatus.PENDING,
      },
    });
  }

  async findMine(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: { course: { select: { id: true, title: true, thumbnailUrl: true, pricingType: true, price: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  // ---------- Admin / Campus Manager management ----------

  async findAll(filters: { courseId?: string; status?: EnrollmentStatus }) {
    return this.prisma.enrollment.findMany({
      where: filters,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async updateStatus(id: string, dto: UpdateEnrollmentStatusDto) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const updated = await this.prisma.enrollment.update({ where: { id }, data: { status: dto.status } });

    if (dto.status === EnrollmentStatus.ACTIVE && enrollment.status !== EnrollmentStatus.ACTIVE) {
      const course = await this.prisma.course.findUnique({ where: { id: enrollment.courseId } });
      await this.notificationsService.create(
        enrollment.userId,
        'Enrollment activated',
        `Your enrollment in "${course?.title ?? 'your course'}" is now active. You can start learning!`,
      );
    }

    return updated;
  }

  // ---------- Content access gating ----------

  // The single source of truth for "can this user see this course's real
  // lesson content" — used by getGatedCurriculum below, and importable
  // by future modules (e.g. Phase 5 live class join links) that need
  // the same check.
  async hasActiveAccess(user: RequestUser, courseId: string): Promise<boolean> {
    if (user.role === UserRole.ADMIN) return true;

    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return false;

    if (user.role === UserRole.TEACHER && course.teacherId === user.id) return true;
    if (course.isFreeTrial) return true;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });

    if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) return false;
    if (enrollment.expiresAt && enrollment.expiresAt < new Date()) return false;

    return true;
  }

  // Returns the curriculum tree. If the user doesn't have access, lesson
  // content fields are stripped and replaced with `locked: true` — the
  // outline (titles, structure) still shows so the course page keeps its
  // marketing value, but nothing paid stays hidden.
  async getGatedCurriculum(courseId: string, user: RequestUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        subjects: {
          orderBy: { order: 'asc' },
          include: {
            chapters: {
              orderBy: { order: 'asc' },
              include: { lessons: { orderBy: { order: 'asc' } } },
            },
          },
        },
      },
    });

    if (!course) throw new NotFoundException('Course not found');

    const hasAccess = await this.hasActiveAccess(user, courseId);

    const subjects = course.subjects.map((subject) => ({
      ...subject,
      chapters: subject.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          order: lesson.order,
          locked: !hasAccess,
          videoUrl: hasAccess ? lesson.videoUrl : null,
          readingBody: hasAccess ? lesson.readingBody : null,
          quizId: hasAccess ? lesson.quizId : null,
          assignmentId: hasAccess ? lesson.assignmentId : null,
        })),
      })),
    }));

    return { ...course, subjects, hasAccess };
  }

  // ---------- Transfer requests (student changes program/course) ----------

  async requestTransfer(userId: string, dto: CreateTransferRequestDto) {
    // Student must have an existing enrollment to transfer FROM.
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PENDING] } },
      orderBy: { startedAt: 'desc' },
    });
    if (!enrollment) {
      throw new NotFoundException('No active enrollment found to transfer from');
    }

    const targetCourse = await this.prisma.course.findUnique({
      where: { id: dto.requestedCourseId },
    });
    if (!targetCourse || !targetCourse.isPublished) {
      throw new NotFoundException('Requested course not found');
    }

    return this.prisma.transferRequest.create({
      data: {
        enrollmentId: enrollment.id,
        requestedCourseId: dto.requestedCourseId,
        reason: dto.reason,
      },
    });
  }

  async listTransferRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.transferRequest.findMany({
      where: { status },
      include: {
        enrollment: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
            course: { select: { id: true, title: true } },
          },
        },
        requestedCourse: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Approving a transfer: marks the old enrollment as TRANSFERRED and
  // creates a fresh ACTIVE enrollment in the new course. Run as a
  // transaction so the student is never left with neither.
  async reviewTransferRequest(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewer: RequestUser,
  ) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: { enrollment: true },
    });
    if (!request) throw new NotFoundException('Transfer request not found');
    if (request.status !== 'PENDING') {
      throw new ForbiddenException('This request has already been reviewed');
    }

    if (decision === 'REJECTED') {
      await this.notificationsService.create(
        request.enrollment.userId,
        'Transfer request declined',
        'Your request to transfer to a different course was not approved. Contact your campus for details.',
      );
      return this.prisma.transferRequest.update({
        where: { id },
        data: { status: 'REJECTED', reviewedById: reviewer.id, reviewedAt: new Date() },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: request.enrollmentId },
        data: { status: EnrollmentStatus.TRANSFERRED },
      });

      await tx.enrollment.create({
        data: {
          userId: request.enrollment.userId,
          courseId: request.requestedCourseId,
          status: EnrollmentStatus.ACTIVE,
        },
      });

      return tx.transferRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedById: reviewer.id, reviewedAt: new Date() },
      });
    });

    await this.notificationsService.create(
      request.enrollment.userId,
      'Transfer request approved',
      'Your course transfer has been approved. Check "My Enrollments" to start your new course.',
    );

    return result;
  }
}
