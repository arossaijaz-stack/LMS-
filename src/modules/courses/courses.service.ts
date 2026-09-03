import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  // ---------- Public catalog (marketing site) ----------

  async findPublished(filters: { programId?: string }) {
    return this.prisma.course.findMany({
      where: { isPublished: true, programId: filters.programId },
      orderBy: { createdAt: 'desc' },
      include: { program: { select: { name: true, slug: true } } },
    });
  }

  async findOnePublic(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        program: { select: { name: true, slug: true } },
        teacher: { select: { id: true, fullName: true, avatarUrl: true } },
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

    if (!course || !course.isPublished) {
      throw new NotFoundException('Course not found');
    }

    // Public/anonymous visitors only ever see the curriculum OUTLINE
    // (titles, structure, lesson count) for marketing purposes — never
    // actual lesson content. Real content is only served through the
    // enrollment-gated `GET /enrollments/courses/:id/learn` endpoint
    // (see EnrollmentsModule, Phase 3), which checks free-trial status
    // and active enrollment before revealing videoUrl/readingBody.
    const subjects = course.subjects.map((subject) => ({
      ...subject,
      chapters: subject.chapters.map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          type: lesson.type,
          order: lesson.order,
        })),
      })),
    }));

    return { ...course, subjects };
  }

  // ---------- Admin / Teacher management ----------

  // Teachers see only their own courses (published or not);
  // Admins see everything.
  async findForStaff(user: RequestUser) {
    return this.prisma.course.findMany({
      where: user.role === UserRole.ADMIN ? {} : { teacherId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { program: { select: { name: true } } },
    });
  }

  async create(dto: CreateCourseDto, user: RequestUser) {
    const program = await this.prisma.program.findUnique({ where: { id: dto.programId } });
    if (!program) throw new NotFoundException('Program not found');

    // Teachers can only ever create courses assigned to themselves.
    const teacherId = user.role === UserRole.ADMIN ? dto.teacherId ?? null : user.id;

    return this.prisma.course.create({
      data: {
        ...dto,
        teacherId,
        isPublished: false, // new courses always start as drafts
      },
    });
  }

  async update(id: string, dto: UpdateCourseDto, user: RequestUser) {
    const course = await this.getOwnedCourseOrThrow(id, user);
    // Teachers cannot reassign a course to a different teacher.
    const data = user.role === UserRole.ADMIN ? dto : { ...dto, teacherId: undefined };
    return this.prisma.course.update({ where: { id: course.id }, data });
  }

  async publish(id: string, user: RequestUser, isPublished: boolean) {
    const course = await this.getOwnedCourseOrThrow(id, user);
    // A course needs at least one subject before it can go live —
    // prevents accidentally publishing an empty shell.
    if (isPublished) {
      const subjectCount = await this.prisma.subject.count({ where: { courseId: course.id } });
      if (subjectCount === 0) {
        throw new ForbiddenException('Add at least one subject before publishing this course');
      }
    }
    return this.prisma.course.update({ where: { id: course.id }, data: { isPublished } });
  }

  async remove(id: string, user: RequestUser) {
    const course = await this.getOwnedCourseOrThrow(id, user);
    return this.prisma.course.delete({ where: { id: course.id } });
  }

  // Shared ownership check: Admin can touch any course, Teacher only their own.
  private async getOwnedCourseOrThrow(id: string, user: RequestUser) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');

    if (user.role !== UserRole.ADMIN && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return course;
  }
}
