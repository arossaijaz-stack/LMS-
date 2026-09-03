import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  // ---------- Public catalog ----------

  @Public()
  @Get()
  findPublished(@Query('programId') programId?: string) {
    return this.coursesService.findPublished({ programId });
  }

  @Public()
  @Get(':id')
  findOnePublic(@Param('id') id: string) {
    return this.coursesService.findOnePublic(id);
  }

  // ---------- Staff (Admin + Teacher) ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get('staff/mine')
  findForStaff(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.findForStaff(user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post()
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.create(dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.coursesService.update(id, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.publish(id, user, true);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.publish(id, user, false);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.coursesService.remove(id, user);
  }
}
