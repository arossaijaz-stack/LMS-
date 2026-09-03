import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CreateNoteBookmarkDto, UpdateNoteBookmarkDto } from './dto/engagement.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class NotesService {
  constructor(
    private prisma: PrismaService,
    private enrollmentsService: EnrollmentsService,
  ) {}

  async create(user: RequestUser, dto: CreateNoteBookmarkDto) {
    await this.assertLessonAccess(dto.lessonId, user);
    return this.prisma.noteBookmark.create({
      data: {
        userId: user.id,
        lessonId: dto.lessonId,
        type: dto.type,
        content: dto.content,
      },
    });
  }

  async findMineForLesson(userId: string, lessonId: string) {
    return this.prisma.noteBookmark.findMany({
      where: { userId, lessonId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllMine(userId: string) {
    return this.prisma.noteBookmark.findMany({
      where: { userId },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            chapter: { select: { subject: { select: { course: { select: { id: true, title: true } } } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateNoteBookmarkDto) {
    const note = await this.getOwnedOrThrow(id, userId);
    return this.prisma.noteBookmark.update({ where: { id: note.id }, data: { content: dto.content } });
  }

  async remove(id: string, userId: string) {
    const note = await this.getOwnedOrThrow(id, userId);
    return this.prisma.noteBookmark.delete({ where: { id: note.id } });
  }

  private async getOwnedOrThrow(id: string, userId: string) {
    const note = await this.prisma.noteBookmark.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException('This note does not belong to you');
    return note;
  }

  // A student can only take notes on a lesson they actually have access
  // to — reuses the same gating decision as the lesson content itself.
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
      throw new ForbiddenException('Enroll in this course to take notes on this lesson');
    }
  }
}
