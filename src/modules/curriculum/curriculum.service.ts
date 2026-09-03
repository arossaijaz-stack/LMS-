import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSubjectDto,
  CreateChapterDto,
  CreateLessonDto,
  UpdateLessonDto,
  ReorderDto,
} from './dto/curriculum.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class CurriculumService {
  constructor(private prisma: PrismaService) {}

  // ---------- Full tree for the admin curriculum builder ----------

  async getCourseTree(courseId: string, user: RequestUser) {
    await this.assertCourseOwnership(courseId, user);
    return this.prisma.course.findUnique({
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
  }

  // ---------- Subjects ----------

  async createSubject(courseId: string, dto: CreateSubjectDto, user: RequestUser) {
    await this.assertCourseOwnership(courseId, user);
    const count = await this.prisma.subject.count({ where: { courseId } });
    return this.prisma.subject.create({
      data: { ...dto, courseId, order: count },
    });
  }

  async updateSubject(id: string, dto: CreateSubjectDto, user: RequestUser) {
    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new NotFoundException('Subject not found');
    await this.assertCourseOwnership(subject.courseId, user);
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  async removeSubject(id: string, user: RequestUser) {
    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new NotFoundException('Subject not found');
    await this.assertCourseOwnership(subject.courseId, user);
    return this.prisma.subject.delete({ where: { id } });
  }

  async reorderSubjects(courseId: string, dto: ReorderDto, user: RequestUser) {
    await this.assertCourseOwnership(courseId, user);
    return this.applyReorder('subject', dto);
  }

  // ---------- Chapters ----------

  async createChapter(subjectId: string, dto: CreateChapterDto, user: RequestUser) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found');
    await this.assertCourseOwnership(subject.courseId, user);

    const count = await this.prisma.chapter.count({ where: { subjectId } });
    return this.prisma.chapter.create({
      data: { ...dto, subjectId, order: count },
    });
  }

  async updateChapter(id: string, dto: CreateChapterDto, user: RequestUser) {
    const chapter = await this.getChapterWithCourseId(id);
    await this.assertCourseOwnership(chapter.courseId, user);
    return this.prisma.chapter.update({ where: { id }, data: dto });
  }

  async removeChapter(id: string, user: RequestUser) {
    const chapter = await this.getChapterWithCourseId(id);
    await this.assertCourseOwnership(chapter.courseId, user);
    return this.prisma.chapter.delete({ where: { id } });
  }

  async reorderChapters(subjectId: string, dto: ReorderDto, user: RequestUser) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found');
    await this.assertCourseOwnership(subject.courseId, user);
    return this.applyReorder('chapter', dto);
  }

  // ---------- Lessons ----------

  async createLesson(chapterId: string, dto: CreateLessonDto, user: RequestUser) {
    const chapter = await this.getChapterWithCourseId(chapterId);
    await this.assertCourseOwnership(chapter.courseId, user);

    const count = await this.prisma.lesson.count({ where: { chapterId } });
    return this.prisma.lesson.create({
      data: { ...dto, chapterId, order: count },
    });
  }

  async updateLesson(id: string, dto: UpdateLessonDto, user: RequestUser) {
    const lesson = await this.getLessonWithCourseId(id);
    await this.assertCourseOwnership(lesson.courseId, user);
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async removeLesson(id: string, user: RequestUser) {
    const lesson = await this.getLessonWithCourseId(id);
    await this.assertCourseOwnership(lesson.courseId, user);
    return this.prisma.lesson.delete({ where: { id } });
  }

  async reorderLessons(chapterId: string, dto: ReorderDto, user: RequestUser) {
    const chapter = await this.getChapterWithCourseId(chapterId);
    await this.assertCourseOwnership(chapter.courseId, user);
    return this.applyReorder('lesson', dto);
  }

  // ---------- Shared helpers ----------

  private async applyReorder(model: 'subject' | 'chapter' | 'lesson', dto: ReorderDto) {
    // Runs all order updates in a single transaction so the list never
    // renders in a half-updated state if one write fails.
    await this.prisma.$transaction(
      dto.items.map((item) =>
        (this.prisma[model] as any).update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );
    return { success: true };
  }

  private async getChapterWithCourseId(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { subject: { select: { courseId: true } } },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    return { ...chapter, courseId: chapter.subject.courseId };
  }

  private async getLessonWithCourseId(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { include: { subject: { select: { courseId: true } } } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return { ...lesson, courseId: lesson.chapter.subject.courseId };
  }

  // Admin can touch any course's curriculum; Teacher only their own course.
  private async assertCourseOwnership(courseId: string, user: RequestUser) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    if (user.role !== UserRole.ADMIN && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return course;
  }
}
