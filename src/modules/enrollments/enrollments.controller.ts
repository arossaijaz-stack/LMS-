import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EnrollmentStatus, UserRole } from '@prisma/client';
import { EnrollmentsService } from './enrollments.service';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentStatusDto,
  CreateTransferRequestDto,
  ReviewTransferRequestDto,
} from './dto/enrollment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller()
export class EnrollmentsController {
  constructor(private enrollmentsService: EnrollmentsService) {}

  // ---------- Student self-service ----------
  // No @Roles() needed — the global JwtAuthGuard already requires login,
  // and any authenticated user (student) can enroll/view their own data.

  @Post('enrollments')
  enroll(@Body() dto: CreateEnrollmentDto, @CurrentUser() user: ReqUser) {
    return this.enrollmentsService.enroll(user.id, dto);
  }

  @Get('enrollments/mine')
  findMine(@CurrentUser() user: ReqUser) {
    return this.enrollmentsService.findMine(user.id);
  }

  @Post('enrollments/transfer-requests')
  requestTransfer(@Body() dto: CreateTransferRequestDto, @CurrentUser() user: ReqUser) {
    return this.enrollmentsService.requestTransfer(user.id, dto);
  }

  // ---------- Gated content ----------
  // This is what the student-facing "learn" page calls to actually get
  // lesson content. Works for any authenticated user; the service itself
  // decides how much to reveal based on enrollment/free-trial/ownership.

  @Get('courses/:courseId/learn')
  getGatedCurriculum(@Param('courseId') courseId: string, @CurrentUser() user: ReqUser) {
    return this.enrollmentsService.getGatedCurriculum(courseId, user);
  }

  // ---------- Admin / Campus Manager ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  @Get('enrollments')
  findAll(
    @Query('courseId') courseId?: string,
    @Query('status') status?: EnrollmentStatus,
  ) {
    return this.enrollmentsService.findAll({ courseId, status });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  @Patch('enrollments/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateEnrollmentStatusDto) {
    return this.enrollmentsService.updateStatus(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  @Get('enrollments/transfer-requests')
  listTransferRequests(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.enrollmentsService.listTransferRequests(status);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  @Patch('enrollments/transfer-requests/:id/review')
  reviewTransferRequest(
    @Param('id') id: string,
    @Body() dto: ReviewTransferRequestDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.enrollmentsService.reviewTransferRequest(id, dto.decision, user);
  }
}
