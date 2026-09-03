import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  SubmitAssignmentDto,
  GradeSubmissionDto,
} from './dto/assignment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('assignments')
export class AssignmentsController {
  constructor(private assignmentsService: AssignmentsService) {}

  // ---------- Admin / Teacher ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post()
  create(@Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignmentsService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id/submissions')
  findSubmissionsForAssignment(@Param('id') id: string) {
    return this.assignmentsService.findSubmissionsForAssignment(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch('submissions/:id/grade')
  gradeSubmission(@Param('id') id: string, @Body() dto: GradeSubmissionDto) {
    return this.assignmentsService.gradeSubmission(id, dto);
  }

  // ---------- Student ----------

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Post(':id/submissions')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitAssignmentDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.submit(id, user, dto.fileUrl);
  }

  @Get('submissions/mine')
  findMySubmissions(@CurrentUser() user: ReqUser) {
    return this.assignmentsService.findMySubmissions(user.id);
  }
}
