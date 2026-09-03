import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProgressService } from './progress.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller()
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Post('progress/lessons/:lessonId/complete')
  markComplete(@Param('lessonId') lessonId: string, @CurrentUser() user: ReqUser) {
    return this.progressService.markComplete(lessonId, user);
  }

  @Delete('progress/lessons/:lessonId/complete')
  markIncomplete(@Param('lessonId') lessonId: string, @CurrentUser() user: ReqUser) {
    return this.progressService.markIncomplete(lessonId, user);
  }

  @Get('progress/courses/:courseId')
  getCourseProgress(@Param('courseId') courseId: string, @CurrentUser() user: ReqUser) {
    return this.progressService.getCourseProgress(courseId, user);
  }

  @Get('progress/stats/mine')
  getMyStats(@CurrentUser() user: ReqUser) {
    return this.progressService.getMyStats(user.id);
  }
}
