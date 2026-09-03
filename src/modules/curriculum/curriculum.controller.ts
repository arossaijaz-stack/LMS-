import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurriculumService } from './curriculum.service';
import {
  CreateSubjectDto,
  CreateChapterDto,
  CreateLessonDto,
  UpdateLessonDto,
  ReorderDto,
} from './dto/curriculum.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

// Every route here is Admin/Teacher only — students never touch the
// curriculum builder. (Students read curriculum via the course detail
// endpoint in CoursesModule, or gated lesson content in Phase 3.)
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TEACHER)
@Controller()
export class CurriculumController {
  constructor(private curriculumService: CurriculumService) {}

  // ---------- Full tree ----------

  @Get('courses/:courseId/curriculum')
  getCourseTree(@Param('courseId') courseId: string, @CurrentUser() user: ReqUser) {
    return this.curriculumService.getCourseTree(courseId, user);
  }

  // ---------- Subjects ----------

  @Post('courses/:courseId/subjects')
  createSubject(
    @Param('courseId') courseId: string,
    @Body() dto: CreateSubjectDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.curriculumService.createSubject(courseId, dto, user);
  }

  @Patch('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() dto: CreateSubjectDto, @CurrentUser() user: ReqUser) {
    return this.curriculumService.updateSubject(id, dto, user);
  }

  @Delete('subjects/:id')
  removeSubject(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.curriculumService.removeSubject(id, user);
  }

  @Patch('courses/:courseId/subjects/reorder')
  reorderSubjects(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.curriculumService.reorderSubjects(courseId, dto, user);
  }

  // ---------- Chapters ----------

  @Post('subjects/:subjectId/chapters')
  createChapter(
    @Param('subjectId') subjectId: string,
    @Body() dto: CreateChapterDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.curriculumService.createChapter(subjectId, dto, user);
  }

  @Patch('chapters/:id')
  updateChapter(@Param('id') id: string, @Body() dto: CreateChapterDto, @CurrentUser() user: ReqUser) {
    return this.curriculumService.updateChapter(id, dto, user);
  }

  @Delete('chapters/:id')
  removeChapter(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.curriculumService.removeChapter(id, user);
  }

  @Patch('subjects/:subjectId/chapters/reorder')
  reorderChapters(
    @Param('subjectId') subjectId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.curriculumService.reorderChapters(subjectId, dto, user);
  }

  // ---------- Lessons ----------

  @Post('chapters/:chapterId/lessons')
  createLesson(
    @Param('chapterId') chapterId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.curriculumService.createLesson(chapterId, dto, user);
  }

  @Patch('lessons/:id')
  updateLesson(@Param('id') id: string, @Body() dto: UpdateLessonDto, @CurrentUser() user: ReqUser) {
    return this.curriculumService.updateLesson(id, dto, user);
  }

  @Delete('lessons/:id')
  removeLesson(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.curriculumService.removeLesson(id, user);
  }

  @Patch('chapters/:chapterId/lessons/reorder')
  reorderLessons(
    @Param('chapterId') chapterId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.curriculumService.reorderLessons(chapterId, dto, user);
  }
}
