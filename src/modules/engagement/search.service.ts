import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // Searches published course titles/descriptions, plus lesson TITLES
  // (never lesson content — a search result should never leak paid
  // material to someone who hasn't enrolled). Results are grouped so
  // the frontend can render "Course X — 3 matching lessons" style cards.
  async search(query: string) {
    if (!query || query.trim().length < 2) {
      return { courses: [], lessons: [] };
    }

    const [courses, lessons] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          isPublished: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, title: true, thumbnailUrl: true, program: { select: { name: true } } },
        take: 20,
      }),
      this.prisma.lesson.findMany({
        where: {
          title: { contains: query, mode: 'insensitive' },
          chapter: { subject: { course: { isPublished: true } } },
        },
        select: {
          id: true,
          title: true,
          type: true,
          chapter: {
            select: {
              subject: {
                select: { course: { select: { id: true, title: true } } },
              },
            },
          },
        },
        take: 20,
      }),
    ]);

    return {
      courses,
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        course: l.chapter.subject.course,
      })),
    };
  }
}
