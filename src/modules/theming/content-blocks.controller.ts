import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ContentBlocksService } from './content-blocks.service';
import {
  CreateContentBlockDto,
  ReorderContentBlocksDto,
  UpdateContentBlockDto,
} from './dto/theming.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('content-blocks')
export class ContentBlocksController {
  constructor(private contentBlocksService: ContentBlocksService) {}

  // ---------- Public ----------

  @Public()
  @Get()
  findForSection(@Query('section') section: string) {
    return this.contentBlocksService.findForSection(section);
  }

  // ---------- Admin ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  findAllForAdmin() {
    return this.contentBlocksService.findAllForAdmin();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateContentBlockDto) {
    return this.contentBlocksService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentBlockDto) {
    return this.contentBlocksService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contentBlocksService.remove(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('section/:section/reorder')
  reorder(@Param('section') section: string, @Body() dto: ReorderContentBlocksDto) {
    return this.contentBlocksService.reorder(section, dto);
  }
}
