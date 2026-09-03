import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BatchesService } from './batches.service';
import { AddStudentToBatchDto, CreateBatchDto, UpdateBatchDto } from './dto/live-classes.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller()
export class BatchesController {
  constructor(private batchesService: BatchesService) {}

  // ---------- Admin / Teacher ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post('courses/:courseId/batches')
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateBatchDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.batchesService.create(courseId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get('courses/:courseId/batches')
  findForCourse(@Param('courseId') courseId: string, @CurrentUser() user: ReqUser) {
    return this.batchesService.findForCourse(courseId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch('batches/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto, @CurrentUser() user: ReqUser) {
    return this.batchesService.update(id, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Delete('batches/:id')
  remove(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.batchesService.remove(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.CAMPUS_MANAGER)
  @Post('batches/:id/students')
  addStudent(
    @Param('id') batchId: string,
    @Body() dto: AddStudentToBatchDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.batchesService.addStudent(batchId, dto.userId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.CAMPUS_MANAGER)
  @Delete('batches/:id/students/:userId')
  removeStudent(
    @Param('id') batchId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.batchesService.removeStudent(batchId, userId, user);
  }

  // ---------- Student ----------

  @Get('batches/mine')
  findMyBatches(@CurrentUser() user: ReqUser) {
    return this.batchesService.findMyBatches(user.id);
  }
}
