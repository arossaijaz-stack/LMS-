import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LiveSessionsService } from './live-sessions.service';
import { UserRole } from '@prisma/client';

function buildService() {
  const prisma = {
    liveSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    batchStudent: { findUnique: jest.fn() },
  };
  const provider = {
    createMeeting: jest.fn().mockResolvedValue({
      joinUrl: 'https://zoom.us/j/mock-meeting',
      startUrl: 'https://zoom.us/s/mock-meeting',
    }),
  };
  const batchesService = {
    getOwnedBatchOrThrow: jest.fn(),
  };
  const service = new LiveSessionsService(prisma as any, provider as any, batchesService as any);
  return { service, prisma, provider, batchesService };
}

const STUDENT = { id: 'student-1', role: UserRole.STUDENT };
const TEACHER = { id: 'teacher-1', role: UserRole.TEACHER };

describe('LiveSessionsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schedule', () => {
    it('creates a meeting via the provider and stores the join URL', async () => {
      const { service, prisma, batchesService } = buildService();
      batchesService.getOwnedBatchOrThrow.mockResolvedValue({ id: 'batch-1' });
      prisma.liveSession.create.mockResolvedValue({ id: 'session-1', zoomJoinUrl: 'https://zoom.us/j/mock-meeting' });

      const result = await service.schedule(
        'batch-1',
        { title: 'Lecture 1', scheduledAt: '2026-09-01T10:00:00Z' },
        TEACHER,
      );

      expect(prisma.liveSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ zoomJoinUrl: 'https://zoom.us/j/mock-meeting' }),
        }),
      );
      expect(result.zoomJoinUrl).toBe('https://zoom.us/j/mock-meeting');
    });

    it('rejects scheduling for a batch the Teacher does not own (ownership delegated to BatchesService)', async () => {
      const { service, batchesService } = buildService();
      batchesService.getOwnedBatchOrThrow.mockRejectedValue(new ForbiddenException());

      await expect(
        service.schedule('batch-1', { title: 'X', scheduledAt: '2026-09-01T10:00:00Z' }, TEACHER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getJoinUrl', () => {
    it('gives a batch-member student the join URL', async () => {
      const { service, prisma } = buildService();
      prisma.liveSession.findUnique.mockResolvedValue({
        id: 'session-1',
        batchId: 'batch-1',
        zoomJoinUrl: 'https://zoom.us/j/real',
        scheduledAt: new Date(),
      });
      prisma.batchStudent.findUnique.mockResolvedValue({ id: 'membership-1' });

      const result = await service.getJoinUrl('session-1', STUDENT);
      expect(result.joinUrl).toBe('https://zoom.us/j/real');
    });

    it('blocks a student who is NOT a member of the batch', async () => {
      const { service, prisma } = buildService();
      prisma.liveSession.findUnique.mockResolvedValue({
        id: 'session-1',
        batchId: 'batch-1',
        zoomJoinUrl: 'https://zoom.us/j/real',
      });
      prisma.batchStudent.findUnique.mockResolvedValue(null);

      await expect(service.getJoinUrl('session-1', STUDENT)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when no join link has been set yet', async () => {
      const { service, prisma } = buildService();
      prisma.liveSession.findUnique.mockResolvedValue({
        id: 'session-1',
        batchId: 'batch-1',
        zoomJoinUrl: null,
      });
      prisma.batchStudent.findUnique.mockResolvedValue({ id: 'membership-1' });

      await expect(service.getJoinUrl('session-1', STUDENT)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAttendance', () => {
    it('merges into the existing attendance map rather than overwriting it', async () => {
      const { service, prisma, batchesService } = buildService();
      prisma.liveSession.findUnique.mockResolvedValue({
        id: 'session-1',
        batchId: 'batch-1',
        attendance: { 'other-student': true },
      });
      batchesService.getOwnedBatchOrThrow.mockResolvedValue({ id: 'batch-1' });
      prisma.batchStudent.findUnique.mockResolvedValue({ id: 'membership-1' });
      prisma.liveSession.update.mockResolvedValue({ id: 'session-1' });

      await service.markAttendance('session-1', 'student-1', true, TEACHER);

      expect(prisma.liveSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { attendance: { 'other-student': true, 'student-1': true } },
        }),
      );
    });

    it('rejects marking attendance for a student who is not in the batch', async () => {
      const { service, prisma, batchesService } = buildService();
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'session-1', batchId: 'batch-1', attendance: {} });
      batchesService.getOwnedBatchOrThrow.mockResolvedValue({ id: 'batch-1' });
      prisma.batchStudent.findUnique.mockResolvedValue(null);

      await expect(
        service.markAttendance('session-1', 'not-a-member', true, TEACHER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setRecording', () => {
    it('attaches a recording URL to a session', async () => {
      const { service, prisma, batchesService } = buildService();
      prisma.liveSession.findUnique.mockResolvedValue({ id: 'session-1', batchId: 'batch-1' });
      batchesService.getOwnedBatchOrThrow.mockResolvedValue({ id: 'batch-1' });
      prisma.liveSession.update.mockResolvedValue({ id: 'session-1', recordingUrl: 'https://cdn.example.com/rec.mp4' });

      const result = await service.setRecording('session-1', 'https://cdn.example.com/rec.mp4', TEACHER);
      expect(result.recordingUrl).toBe('https://cdn.example.com/rec.mp4');
    });
  });
});
