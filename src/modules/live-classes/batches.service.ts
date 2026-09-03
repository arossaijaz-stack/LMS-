import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CreateBatchDto, UpdateBatchDto } from './dto/live-classes.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private enrollmentsService: EnrollmentsService,
  ) {}

  async create(courseId: string, dto: CreateBatchDto, user: RequestUser) {
    await this.assertCourseOwnership(courseId, user);
    return this.prisma.batch.create({
      data: {
        courseId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async findForCourse(courseId: string, user: RequestUser) {
    await this.assertCourseOwnership(courseId, user);
    return this.prisma.batch.findMany({
      where: { courseId },
      include: { _count: { select: { students: true, liveSessions: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async update(id: string, dto: UpdateBatchDto, user: RequestUser) {
    const batch = await this.getOwnedBatchOrThrow(id, user);
    return this.prisma.batch.update({
      where: { id: batch.id },
      data: {
        name: dto.name,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async remove(id: string, user: RequestUser) {
    const batch = await this.getOwnedBatchOrThrow(id, user);
    return this.prisma.batch.delete({ where: { id: batch.id } });
  }

  // ---------- Roster management ----------

  // A student can only be added to a batch if they're actively enrolled
  // (or the course is free-trial) in the batch's course — reuses the
  // exact same access decision as lesson/quiz/assignment gating.
  async addStudent(batchId: string, studentUserId: string, user: RequestUser) {
    const batch = await this.getOwnedBatchOrThrow(batchId, user);

    const hasAccess = await this.enrollmentsService.hasActiveAccess(
      { id: studentUserId, role: UserRole.STUDENT },
      batch.courseId,
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        'This student is not actively enrolled in the course this batch belongs to',
      );
    }

    const existing = await this.prisma.batchStudent.findUnique({
      where: { batchId_userId: { batchId, userId: studentUserId } },
    });
    if (existing) {
      throw new ConflictException('This student is already in the batch');
    }

    return this.prisma.batchStudent.create({ data: { batchId, userId: studentUserId } });
  }

  async removeStudent(batchId: string, studentUserId: string, user: RequestUser) {
    await this.getOwnedBatchOrThrow(batchId, user);
    const membership = await this.prisma.batchStudent.findUnique({
      where: { batchId_userId: { batchId, userId: studentUserId } },
    });
    if (!membership) throw new NotFoundException('Student is not in this batch');
    return this.prisma.batchStudent.delete({ where: { id: membership.id } });
  }

  // ---------- Student self-service ----------

  async findMyBatches(userId: string) {
    const memberships = await this.prisma.batchStudent.findMany({
      where: { userId },
      include: {
        batch: {
          include: { course: { select: { id: true, title: true, thumbnailUrl: true } } },
        },
      },
    });
    return memberships.map((m) => m.batch);
  }

  // ---------- Shared helpers ----------

  async getOwnedBatchOrThrow(id: string, user: RequestUser) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found');
    await this.assertCourseOwnership(batch.courseId, user);
    return batch;
  }

  // Course "ownership" here also extends to Campus Manager for roster
  // actions (add/remove student) — they aren't course content owners,
  // but do need to manage who's in a batch as part of their enrollment
  // administration duties (same reasoning as their transfer-request
  // approval power in Phase 3).
  private async assertCourseOwnership(courseId: string, user: RequestUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    const isPrivileged = user.role === UserRole.ADMIN || user.role === UserRole.CAMPUS_MANAGER;
    if (!isPrivileged && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return course;
  }
}
