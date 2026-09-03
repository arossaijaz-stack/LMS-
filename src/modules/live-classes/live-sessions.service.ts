import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveClassProviderService } from './live-class-provider.service';
import { BatchesService } from './batches.service';
import { CreateLiveSessionDto, UpdateLiveSessionDto } from './dto/live-classes.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

@Injectable()
export class LiveSessionsService {
  constructor(
    private prisma: PrismaService,
    private provider: LiveClassProviderService,
    private batchesService: BatchesService,
  ) {}

  // ---------- Staff: scheduling ----------

  async schedule(batchId: string, dto: CreateLiveSessionDto, user: RequestUser) {
    await this.batchesService.getOwnedBatchOrThrow(batchId, user);

    const scheduledAt = new Date(dto.scheduledAt);
    const meeting = await this.provider.createMeeting(dto.title, scheduledAt);

    return this.prisma.liveSession.create({
      data: {
        batchId,
        title: dto.title,
        scheduledAt,
        zoomJoinUrl: meeting.joinUrl,
      },
    });
  }

  async update(id: string, dto: UpdateLiveSessionDto, user: RequestUser) {
    const session = await this.getOwnedSessionOrThrow(id, user);
    return this.prisma.liveSession.update({
      where: { id: session.id },
      data: {
        title: dto.title,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  async remove(id: string, user: RequestUser) {
    const session = await this.getOwnedSessionOrThrow(id, user);
    return this.prisma.liveSession.delete({ where: { id: session.id } });
  }

  async findForBatch(batchId: string, user: RequestUser) {
    // Staff (owner/admin/campus manager) OR a student who is a member
    // of this batch can view its session list.
    const isStaffMember = user.role === UserRole.ADMIN || user.role === UserRole.CAMPUS_MANAGER || user.role === UserRole.TEACHER;
    if (isStaffMember) {
      await this.batchesService.getOwnedBatchOrThrow(batchId, user);
    } else {
      await this.assertStudentInBatch(batchId, user.id);
    }

    return this.prisma.liveSession.findMany({
      where: { batchId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  // ---------- Student: calendar + joining ----------

  // Aggregates upcoming/past sessions across every batch the student
  // belongs to — this is what a "My Live Classes" calendar screen calls.
  async findMySessions(userId: string) {
    return this.prisma.liveSession.findMany({
      where: { batch: { students: { some: { userId } } } },
      include: { batch: { include: { course: { select: { id: true, title: true } } } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async getJoinUrl(sessionId: string, user: RequestUser) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    const isStaffMember = user.role === UserRole.ADMIN || user.role === UserRole.TEACHER;
    if (isStaffMember) {
      await this.batchesService.getOwnedBatchOrThrow(session.batchId, user);
    } else {
      await this.assertStudentInBatch(session.batchId, user.id);
    }

    if (!session.zoomJoinUrl) {
      throw new NotFoundException('No join link has been set for this session yet');
    }
    return { joinUrl: session.zoomJoinUrl, scheduledAt: session.scheduledAt };
  }

  // ---------- Attendance ----------

  // Attendance is stored as a JSON map ({ [userId]: boolean }) on the
  // session row rather than a separate table — simple and fine at this
  // scale; revisit with a proper join table if per-session attendance
  // reporting/analytics (Phase 8) needs to be queried at scale.
  async markAttendance(sessionId: string, targetUserId: string, present: boolean, user: RequestUser) {
    const session = await this.getOwnedSessionOrThrow(sessionId, user);

    await this.assertStudentInBatch(session.batchId, targetUserId);

    const currentAttendance = (session.attendance as Record<string, boolean>) ?? {};
    const updatedAttendance = { ...currentAttendance, [targetUserId]: present };

    return this.prisma.liveSession.update({
      where: { id: session.id },
      data: { attendance: updatedAttendance },
    });
  }

  // ---------- Recording (post-session) ----------

  // Staff calls this once a recording is available — either pasted in
  // manually, or (once wired) fetched automatically from the provider's
  // Recordings API via LiveClassProviderService.fetchRecordingUrl.
  async setRecording(sessionId: string, recordingUrl: string, user: RequestUser) {
    const session = await this.getOwnedSessionOrThrow(sessionId, user);
    return this.prisma.liveSession.update({
      where: { id: session.id },
      data: { recordingUrl },
    });
  }

  // ---------- Shared helpers ----------

  private async getOwnedSessionOrThrow(id: string, user: RequestUser) {
    const session = await this.prisma.liveSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    await this.batchesService.getOwnedBatchOrThrow(session.batchId, user);
    return session;
  }

  private async assertStudentInBatch(batchId: string, userId: string) {
    const membership = await this.prisma.batchStudent.findUnique({
      where: { batchId_userId: { batchId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this batch');
    }
    return membership;
  }
}
