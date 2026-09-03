import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LiveSessionsService } from './live-sessions.service';
import {
  CreateLiveSessionDto,
  MarkAttendanceDto,
  SetRecordingDto,
  UpdateLiveSessionDto,
} from './dto/live-classes.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller()
export class LiveSessionsController {
  constructor(private liveSessionsService: LiveSessionsService) {}

  // ---------- Admin / Teacher ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post('batches/:batchId/sessions')
  schedule(
    @Param('batchId') batchId: string,
    @Body() dto: CreateLiveSessionDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.liveSessionsService.schedule(batchId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch('sessions/:id')
  update(@Param('id') id: string, @Body() dto: UpdateLiveSessionDto, @CurrentUser() user: ReqUser) {
    return this.liveSessionsService.update(id, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Delete('sessions/:id')
  remove(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.liveSessionsService.remove(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch('sessions/:id/attendance/:userId')
  markAttendance(
    @Param('id') sessionId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.liveSessionsService.markAttendance(sessionId, targetUserId, dto.present, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch('sessions/:id/recording')
  setRecording(@Param('id') id: string, @Body() dto: SetRecordingDto, @CurrentUser() user: ReqUser) {
    return this.liveSessionsService.setRecording(id, dto.recordingUrl, user);
  }

  // ---------- Shared (staff or batch-member student) ----------

  @Get('batches/:batchId/sessions')
  findForBatch(@Param('batchId') batchId: string, @CurrentUser() user: ReqUser) {
    return this.liveSessionsService.findForBatch(batchId, user);
  }

  @Get('sessions/:id/join')
  getJoinUrl(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.liveSessionsService.getJoinUrl(id, user);
  }

  // ---------- Student ----------

  @Get('sessions/mine')
  findMySessions(@CurrentUser() user: ReqUser) {
    return this.liveSessionsService.findMySessions(user.id);
  }
}
