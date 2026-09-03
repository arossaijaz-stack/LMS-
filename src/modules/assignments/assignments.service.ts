import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  GradeSubmissionDto,
} from './dto/assignment.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private enrollmentsService: EnrollmentsService,
    private notificationsService: NotificationsService,
  ) {}

  // ---------- Admin/Teacher management ----------
  // Same shared-resource ownership model as Quizzes — see the note in
  // QuizzesService for why this isn't locked to a single teacher.

  async create(dto: CreateAssignmentDto) {
    return this.prisma.assignment.create({
      data: {
        title: dto.title,
        instructions: dto.instructions,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    await this.ensureExists(id);
    return this.prisma.assignment.update({
      where: { id },
      data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.assignment.delete({ where: { id } });
  }

  async findOne(id: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  // ---------- Student submission ----------

  // Resubmitting before grading is allowed and simply overwrites the
  // previous file — intentional UX choice (students shouldn't need staff
  // help to fix a wrong upload). Once a grade is set, the submission is
  // still technically overwritable here; add a `isLocked` check in
  // Phase 8 if the client wants resubmission blocked after grading.
  async submit(assignmentId: string, user: RequestUser, fileUrl: string) {
    await this.ensureExists(assignmentId);
    await this.assertCanSubmit(assignmentId, user);

    const existing = await this.prisma.assignmentSubmission.findFirst({
      where: { assignmentId, userId: user.id },
    });

    if (existing) {
      return this.prisma.assignmentSubmission.update({
        where: { id: existing.id },
        data: { fileUrl, submittedAt: new Date(), grade: null, feedback: null },
      });
    }

    return this.prisma.assignmentSubmission.create({
      data: { assignmentId, userId: user.id, fileUrl },
    });
  }

  async findMySubmissions(userId: string) {
    return this.prisma.assignmentSubmission.findMany({
      where: { userId },
      include: { assignment: { select: { id: true, title: true, dueDate: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  // ---------- Staff grading ----------

  async findSubmissionsForAssignment(assignmentId: string) {
    await this.ensureExists(assignmentId);
    return this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async gradeSubmission(submissionId: string, dto: GradeSubmissionDto) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: { assignment: { select: { title: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: { grade: dto.grade, feedback: dto.feedback },
    });

    await this.notificationsService.create(
      submission.userId,
      'Assignment graded',
      `Your submission for "${submission.assignment.title}" has been graded: ${dto.grade}/100.`,
    );

    return updated;
  }

  // ---------- Access gating ----------
  // Mirrors QuizzesService's pattern exactly: if the assignment is
  // attached to a lesson, the student needs active course access.
  private async assertCanSubmit(assignmentId: string, user: RequestUser) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.TEACHER) return;

    const lesson = await this.prisma.lesson.findUnique({
      where: { assignmentId },
      include: { chapter: { include: { subject: true } } },
    });

    if (!lesson) return; // not attached to a course — open submission

    const courseId = lesson.chapter.subject.courseId;
    const hasAccess = await this.enrollmentsService.hasActiveAccess(user, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Enroll in this course to submit this assignment');
    }
  }

  private async ensureExists(id: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }
}
