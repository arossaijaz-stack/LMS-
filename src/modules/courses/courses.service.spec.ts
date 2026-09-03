import { ForbiddenException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    program: { findUnique: jest.fn() },
    course: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subject: { count: jest.fn() },
  };
  const service = new CoursesService(prisma as any);
  return { service, prisma };
}

const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };
const OWNER_TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };
const OTHER_TEACHER = { id: 'teacher-2', role: UserRole.TEACHER };

describe('CoursesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('publish', () => {
    it('refuses to publish a course with zero subjects', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.subject.count.mockResolvedValue(0);

      await expect(service.publish('course-1', OWNER_TEACHER, true)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('publishes successfully once at least one subject exists', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.subject.count.mockResolvedValue(2);
      prisma.course.update.mockResolvedValue({ id: 'course-1', isPublished: true });

      const result = await service.publish('course-1', OWNER_TEACHER, true);
      expect(result.isPublished).toBe(true);
    });
  });

  describe('ownership enforcement', () => {
    it('lets a Teacher edit their own course', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.course.update.mockResolvedValue({ id: 'course-1', title: 'Updated' });

      const result = await service.update('course-1', { title: 'Updated' }, OWNER_TEACHER);
      expect(result.title).toBe('Updated');
    });

    it('blocks a Teacher from editing a course they do not own', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });

      await expect(
        service.update('course-1', { title: 'Hijacked' }, OTHER_TEACHER),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('lets an Admin edit ANY course regardless of teacherId', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.course.update.mockResolvedValue({ id: 'course-1', title: 'Admin Edit' });

      const result = await service.update('course-1', { title: 'Admin Edit' }, ADMIN);
      expect(result.title).toBe('Admin Edit');
    });

    it('prevents a Teacher from reassigning a course to a different teacher via update', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.course.update.mockResolvedValue({ id: 'course-1' });

      await service.update('course-1', { teacherId: OTHER_TEACHER.id } as any, OWNER_TEACHER);

      // teacherId must NOT be part of the data sent to Prisma for a Teacher caller
      const callArgs = prisma.course.update.mock.calls[0][0];
      expect(callArgs.data.teacherId).toBeUndefined();
    });
  });

  describe('create', () => {
    it('forces teacherId to the caller when a Teacher creates a course, ignoring any dto.teacherId', async () => {
      const { service, prisma } = buildService();
      prisma.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prisma.course.create.mockResolvedValue({ id: 'course-new' });

      await service.create(
        {
          programId: 'prog-1',
          title: 'New Course',
          pricingType: 'MONTHLY' as any,
          price: '1000',
          teacherId: OTHER_TEACHER.id, // attempting to assign someone else
        } as any,
        OWNER_TEACHER,
      );

      const callArgs = prisma.course.create.mock.calls[0][0];
      expect(callArgs.data.teacherId).toBe(OWNER_TEACHER.id);
    });

    it('always creates new courses as unpublished drafts', async () => {
      const { service, prisma } = buildService();
      prisma.program.findUnique.mockResolvedValue({ id: 'prog-1' });
      prisma.course.create.mockResolvedValue({ id: 'course-new' });

      await service.create(
        { programId: 'prog-1', title: 'New Course', pricingType: 'MONTHLY' as any, price: '1000' } as any,
        ADMIN,
      );

      const callArgs = prisma.course.create.mock.calls[0][0];
      expect(callArgs.data.isPublished).toBe(false);
    });
  });
});
