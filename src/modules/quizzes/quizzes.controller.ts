import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { QuizzesService } from './quizzes.service';
import { CreateQuestionDto, CreateQuizDto, SubmitQuizAttemptDto, UpdateQuizDto } from './dto/quiz.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('quizzes')
export class QuizzesController {
  constructor(private quizzesService: QuizzesService) {}

  // ---------- Admin / Teacher: quiz + question bank management ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post()
  createQuiz(@Body() dto: CreateQuizDto) {
    return this.quizzesService.createQuiz(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id/staff')
  getQuizForStaff(@Param('id') id: string) {
    return this.quizzesService.getQuizForStaff(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch(':id')
  updateQuiz(@Param('id') id: string, @Body() dto: UpdateQuizDto) {
    return this.quizzesService.updateQuiz(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Delete(':id')
  removeQuiz(@Param('id') id: string) {
    return this.quizzesService.removeQuiz(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Post(':id/questions')
  addQuestion(@Param('id') quizId: string, @Body() dto: CreateQuestionDto) {
    return this.quizzesService.addQuestion(quizId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: Partial<CreateQuestionDto>) {
    return this.quizzesService.updateQuestion(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Delete('questions/:id')
  removeQuestion(@Param('id') id: string) {
    return this.quizzesService.removeQuestion(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @Get(':id/attempts')
  findAttemptsForQuiz(@Param('id') quizId: string) {
    return this.quizzesService.findAttemptsForQuiz(quizId);
  }

  // ---------- Student ----------

  @Get(':id/take')
  getQuizForStudent(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.quizzesService.getQuizForStudent(id, user);
  }

  @Post(':id/attempts')
  submitAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitQuizAttemptDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.quizzesService.submitAttempt(id, user, dto.answers);
  }

  @Get('attempts/mine')
  findMyAttempts(@CurrentUser() user: ReqUser) {
    return this.quizzesService.findMyAttempts(user.id);
  }
}
