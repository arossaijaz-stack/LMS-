import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    lesson: { findUnique: jest.fn() },
    noteBookmark: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const enrollmentsService = { hasActiveAccess: jest.fn() };
  const service = new NotesService(prisma as any, enrollmentsService as any);
  return { service, prisma, enrollmentsService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };
const OTHER_STUDENT = { id: 'student-2', role: UserRole.STUDENT };

describe('NotesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('rejects creating a note on a lesson the student cannot access', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1',
        chapter: { subject: { courseId: 'course-1' } },
      });
      enrollmentsService.hasActiveAccess.mockResolvedValue(false);

      await expect(
        service.create(STUDENT, { lessonId: 'lesson-1', type: 'note', content: 'Hi' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.noteBookmark.create).not.toHaveBeenCalled();
    });

    it('creates a note when the student has access', async () => {
      const { service, prisma, enrollmentsService } = buildService();
      prisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1',
        chapter: { subject: { courseId: 'course-1' } },
      });
      enrollmentsService.hasActiveAccess.mockResolvedValue(true);
      prisma.noteBookmark.create.mockResolvedValue({ id: 'note-1' });

      const result = await service.create(STUDENT, {
        lessonId: 'lesson-1',
        type: 'note',
        content: 'Remember this',
      });
      expect(result).toEqual({ id: 'note-1' });
    });
  });

  describe('update / remove', () => {
    it('blocks editing a note that belongs to someone else', async () => {
      const { service, prisma } = buildService();
      prisma.noteBookmark.findUnique.mockResolvedValue({ id: 'note-1', userId: STUDENT.id });

      await expect(
        service.update('note-1', OTHER_STUDENT.id, { content: 'Hijacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the owner to edit their own note', async () => {
      const { service, prisma } = buildService();
      prisma.noteBookmark.findUnique.mockResolvedValue({ id: 'note-1', userId: STUDENT.id });
      prisma.noteBookmark.update.mockResolvedValue({ id: 'note-1', content: 'Updated' });

      const result = await service.update('note-1', STUDENT.id, { content: 'Updated' });
      expect(result.content).toBe('Updated');
    });

    it('throws NotFoundException when the note does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.noteBookmark.findUnique.mockResolvedValue(null);

      await expect(service.remove('ghost-note', STUDENT.id)).rejects.toThrow(NotFoundException);
    });
  });
});
