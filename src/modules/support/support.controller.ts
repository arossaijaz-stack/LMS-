import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TicketStatus, UserRole } from '@prisma/client';
import { SupportService } from './support.service';
import {
  AssignTicketDto,
  CreateTicketDto,
  ReplyToTicketDto,
  UpdateTicketStatusDto,
} from './dto/ticket.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('tickets')
export class SupportController {
  constructor(private supportService: SupportService) {}

  // ---------- Any authenticated user ----------

  @Post()
  createTicket(@Body() dto: CreateTicketDto, @CurrentUser() user: ReqUser) {
    return this.supportService.createTicket(user, dto);
  }

  @Get('mine')
  findMine(@CurrentUser() user: ReqUser) {
    return this.supportService.findMine(user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.supportService.getOne(id, user);
  }

  @Post(':id/messages')
  reply(@Param('id') id: string, @Body() dto: ReplyToTicketDto, @CurrentUser() user: ReqUser) {
    return this.supportService.reply(id, user, dto.body);
  }

  // ---------- Staff (Admin/Support) ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Get()
  findAll(@Query('status') status?: TicketStatus, @Query('assignedToId') assignedToId?: string) {
    return this.supportService.findAll({ status, assignedToId });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.supportService.updateStatus(id, dto.status);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.supportService.assign(id, dto.assignedToId);
  }
}
