import { Controller, Get, Param } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { LeaderboardService } from './leaderboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get('courses/:courseId')
  getCourseLeaderboard(@Param('courseId') courseId: string, @CurrentUser() user: ReqUser) {
    return this.leaderboardService.getCourseLeaderboard(courseId, user);
  }
}
