import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionType, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CreateQuestionDto, CreateQuizDto, UpdateQuizDto } from './dto/quiz.dto';

interface RequestUser {
  id: string;
  role: UserRole;
}

// Exported standalone so it can be unit-tested in complete isolation from
// Prisma/NestJS — pure function, no side effects, easy to reason about.
export function gradeQuizAttempt(
  questions: { id: string; type: QuestionType; options: any }[],
  answers: Record<string, string | string[]>,
) {
  const objectiveQuestions = questions.filter((q) => q.type !== QuestionType.OPEN_ENDED);
  let correctCount = 0;
  const breakdown: Record<string, { correct: boolean | null; }> = {};

  for (const question of questions) {
    const studentAnswer = answers[question.id];

    if (question.type === QuestionType.OPEN_ENDED) {
      // Never auto-graded — a teacher reviews these manually later.
      breakdown[question.id] = { correct: null };
      continue;
    }

    const options: { id: string; isCorrect: boolean }[] = question.options ?? [];
    const correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);

    let isCorrect = false;
    if (question.type === QuestionType.SINGLE_CHOICE) {
      isCorrect = typeof studentAnswer === 'string' && correctOptionIds.includes(studentAnswer);
    } else if (question.type === QuestionType.MULTI_CHOICE) {
      const given = Array.isArray(studentAnswer) ? [...studentAnswer].sort() : [];
      const correct = [...correctOptionIds].sort();
      isCorrect = given.length === correct.length && given.every((id, i) => id === correct[i]);
    }

    breakdown[question.id] = { correct: isCorrect };
    if (isCorrect) correctCount++;
  }

  const score =
    objectiveQuestions.length > 0
      ? Math.round((correctCount / objectiveQuestions.length) * 100)
      : null;

  const hasOpenEndedQuestions = questions.some((q) => q.type === QuestionType.OPEN_ENDED);

  return { score, breakdown, correctCount, totalObjective: objectiveQuestions.length, hasOpenEndedQuestions };
}

@Injectable()
export class QuizzesService {
  constructor(
    private prisma: PrismaService,
    private enrollmentsService: EnrollmentsService,
  ) {}

  // ---------- Admin/Teacher: quiz + question bank management ----------
  //
  // NOTE on ownership: unlike Courses/Curriculum, quizzes are treated as a
  // shared question-bank resource manageable by any Admin or Teacher,
  // rather than being locked to whoever created them — a quiz may be
  // authored once and reused across multiple lessons/courses. This is a
  // deliberate simplification; if your client wants per-teacher quiz
  // ownership later, add a `createdById` field and mirror the ownership
  // check pattern already used in CoursesService.

  async createQuiz(dto: CreateQuizDto) {
    return this.prisma.quiz.create({
      data: {
        title: dto.title,
        timeLimitMin: dto.timeLimitMin,
        randomize: dto.randomize ?? false,
        questions: dto.questions
          ? {
              create: dto.questions.map((q, index) => ({
                text: q.text,
                type: q.type,
                options: q.options as any,
                correctAnswer: q.correctAnswer,
                order: index,
              })),
            }
          : undefined,
      },
      include: { questions: true },
    });
  }

  async updateQuiz(id: string, dto: UpdateQuizDto) {
    await this.ensureQuizExists(id);
    return this.prisma.quiz.update({ where: { id }, data: dto });
  }

  async removeQuiz(id: string) {
    await this.ensureQuizExists(id);
    return this.prisma.quiz.delete({ where: { id } });
  }

  // Full view including correct answers — staff only.
  async getQuizForStaff(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }

  async addQuestion(quizId: string, dto: CreateQuestionDto) {
    await this.ensureQuizExists(quizId);
    const count = await this.prisma.question.count({ where: { quizId } });
    return this.prisma.question.create({
      data: {
        quizId,
        text: dto.text,
        type: dto.type,
        options: dto.options as any,
        correctAnswer: dto.correctAnswer,
        order: count,
      },
    });
  }

  async updateQuestion(id: string, dto: Partial<CreateQuestionDto>) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');
    return this.prisma.question.update({
      where: { id },
      data: { ...dto, options: dto.options as any },
    });
  }

  async removeQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');
    return this.prisma.question.delete({ where: { id } });
  }

  // ---------- Student: taking a quiz ----------

  // Returns questions WITHOUT `isCorrect` flags or `correctAnswer` —
  // never leak the answer key to the student's browser.
  async getQuizForStudent(quizId: string, user: RequestUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    await this.assertCanTakeQuiz(quizId, user);

    let questions = quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: Array.isArray(q.options)
        ? (q.options as any[]).map((o) => ({ id: o.id, text: o.text })) // strip isCorrect
        : q.options,
    }));

    if (quiz.randomize) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    return {
      id: quiz.id,
      title: quiz.title,
      timeLimitMin: quiz.timeLimitMin,
      questions,
    };
  }

  async submitAttempt(quizId: string, user: RequestUser, answers: Record<string, string | string[]>) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    await this.assertCanTakeQuiz(quizId, user);

    const result = gradeQuizAttempt(quiz.questions as any, answers);

    return this.prisma.quizAttempt.create({
      data: {
        quizId,
        userId: user.id,
        answers: answers as any,
        score: result.score,
        submittedAt: new Date(),
      },
    });
  }

  async findMyAttempts(userId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { userId },
      include: { quiz: { select: { id: true, title: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  // Staff review of all attempts for a given quiz (e.g. to manually grade
  // any open-ended questions, which auto-grading always skips).
  async findAttemptsForQuiz(quizId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { quizId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  // ---------- Access gating ----------

  // A quiz may or may not be attached to a lesson (it could be an
  // unattached/draft item in the question bank). If it IS attached,
  // the student must have active course access to take it — reuses the
  // exact same access decision as lesson content (Phase 3).
  private async assertCanTakeQuiz(quizId: string, user: RequestUser) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.TEACHER) return;

    const lesson = await this.prisma.lesson.findUnique({
      where: { quizId },
      include: { chapter: { include: { subject: true } } },
    });

    // Not attached to any lesson yet — treat as open/practice quiz.
    if (!lesson) return;

    const courseId = lesson.chapter.subject.courseId;
    const hasAccess = await this.enrollmentsService.hasActiveAccess(user, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Enroll in this course to take this quiz');
    }
  }

  private async ensureQuizExists(id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quiz;
  }
}
