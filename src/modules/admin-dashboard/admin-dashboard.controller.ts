import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminDashboardService } from './admin-dashboard.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminDashboardController {
  constructor(private dashboardService: AdminDashboardService) {}

  @Get('overview')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('reports/revenue')
  getRevenueReport() {
    return this.dashboardService.getRevenueReport();
  }

  @Get('reports/teachers')
  getTeacherPerformance(@Query('teacherId') teacherId?: string) {
    return this.dashboardService.getTeacherPerformance(teacherId);
  }

  @Get('reports/courses/:courseId/engagement')
  getContentEngagement(@Param('courseId') courseId: string) {
    return this.dashboardService.getContentEngagement(courseId);
  }
}
