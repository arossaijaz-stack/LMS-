import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get('mine')
  findMine(@CurrentUser() user: ReqUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.notificationsService.findMine(user.id, unreadOnly === 'true');
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: ReqUser) {
    return this.notificationsService.markAllRead(user.id);
  }
}
