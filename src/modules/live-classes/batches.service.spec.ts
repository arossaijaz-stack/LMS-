import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    course: { findUnique: jest.fn() },
    batch: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    batchStudent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const enrollmentsService = { hasActiveAccess: jest.fn() };
  const service = new BatchesService(prisma as any, enrollmentsService as any);
  return { service, prisma, enrollmentsService };
}

const ADMIN = { id: 'admin-1', role: UserRole.ADMIN };
const OWNER_TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };
const OTHER_TEACHER = { id: 'teacher-2', role: UserRole.TEACHER };
const CAMPUS_MANAGER = { id: 'cm-1', role: UserRole.CAMPUS_MANAGER };

describe('BatchesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('ownership enforcement', () => {
    it('lets the owning Teacher create a batch', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.batch.create.mockResolvedValue({ id: 'batch-1' });

      await service.create('course-1', { name: 'Morning Batch', startDate: '2026-09-01' }, OWNER_TEACHER);
      expect(prisma.batch.create).toHaveBeenCalled();
    });

    it('blocks a non-owning Teacher from creating a batch', async () => {
      const { service, prisma } = buildService();
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });

      await expect(
        service.create('course-1', { name: 'Batch', startDate: '2026-09-01' }, OTHER_TEACHER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a Campus Manager manage rosters even though they are not the course teacher', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', courseId: 'course-1' });
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      enrollmentsService.hasActiveAccess.mockResolvedValue(true);
      prisma.batchStudent.findUnique.mockResolvedValue(null);
      prisma.batchStudent.create.mockResolvedValue({ id: 'bs-1' });

      await expect(
        service.addStudent('batch-1', 'student-1', CAMPUS_MANAGER),
      ).resolves.toBeDefined();
    });
  });

  describe('addStudent', () => {
    it('rejects adding a student who is not actively enrolled in the course', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', courseId: 'course-1' });
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      enrollmentsService.hasActiveAccess.mockResolvedValue(false);

      await expect(service.addStudent('batch-1', 'student-1', OWNER_TEACHER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.batchStudent.create).not.toHaveBeenCalled();
    });

    it('rejects adding the same student twice', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', courseId: 'course-1' });
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      enrollmentsService.hasActiveAccess.mockResolvedValue(true);
      prisma.batchStudent.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.addStudent('batch-1', 'student-1', OWNER_TEACHER)).rejects.toThrow(
        ConflictException,
      );
    });

    it('adds a properly enrolled student successfully', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', courseId: 'course-1' });
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      enrollmentsService.hasActiveAccess.mockResolvedValue(true);
      prisma.batchStudent.findUnique.mockResolvedValue(null);
      prisma.batchStudent.create.mockResolvedValue({ id: 'bs-1' });

      const result = await service.addStudent('batch-1', 'student-1', OWNER_TEACHER);
      expect(result).toEqual({ id: 'bs-1' });
    });
  });

  describe('removeStudent', () => {
    it('throws NotFoundException when the student is not actually in the batch', async () => {
      const { service, prisma } = buildService();
      prisma.batch.findUnique.mockResolvedValue({ id: 'batch-1', courseId: 'course-1' });
      prisma.course.findUnique.mockResolvedValue({ id: 'course-1', teacherId: OWNER_TEACHER.id });
      prisma.batchStudent.findUnique.mockResolvedValue(null);

      await expect(service.removeStudent('batch-1', 'student-1', OWNER_TEACHER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
