import { ForbiddenException } from '@nestjs/common';
import { gradeQuizAttempt, QuizzesService } from './quizzes.service';
import { QuestionType, UserRole } from '@prisma/client';

describe('gradeQuizAttempt (pure grading logic)', () => {
  const singleChoiceQ = {
    id: 'q1',
    type: QuestionType.SINGLE_CHOICE,
    options: [
      { id: 'a', text: 'Paris', isCorrect: true },
      { id: 'b', text: 'London', isCorrect: false },
    ],
  };

  const multiChoiceQ = {
    id: 'q2',
    type: QuestionType.MULTI_CHOICE,
    options: [
      { id: 'a', text: 'Red', isCorrect: true },
      { id: 'b', text: 'Blue', isCorrect: true },
      { id: 'c', text: 'Green', isCorrect: false },
    ],
  };

  const openEndedQ = {
    id: 'q3',
    type: QuestionType.OPEN_ENDED,
    options: null,
  };

  it('marks a correct single-choice answer as correct', () => {
    const result = gradeQuizAttempt([singleChoiceQ] as any, { q1: 'a' });
    expect(result.breakdown.q1.correct).toBe(true);
    expect(result.score).toBe(100);
  });

  it('marks a wrong single-choice answer as incorrect', () => {
    const result = gradeQuizAttempt([singleChoiceQ] as any, { q1: 'b' });
    expect(result.breakdown.q1.correct).toBe(false);
    expect(result.score).toBe(0);
  });

  it('marks multi-choice correct only when the exact set matches (no partial credit)', () => {
    const exactMatch = gradeQuizAttempt([multiChoiceQ] as any, { q2: ['a', 'b'] });
    expect(exactMatch.breakdown.q2.correct).toBe(true);

    const partialMatch = gradeQuizAttempt([multiChoiceQ] as any, { q2: ['a'] });
    expect(partialMatch.breakdown.q2.correct).toBe(false);

    const orderShouldNotMatter = gradeQuizAttempt([multiChoiceQ] as any, { q2: ['b', 'a'] });
    expect(orderShouldNotMatter.breakdown.q2.correct).toBe(true);

    const extraWrongOption = gradeQuizAttempt([multiChoiceQ] as any, { q2: ['a', 'b', 'c'] });
    expect(extraWrongOption.breakdown.q2.correct).toBe(false);
  });

  it('never auto-grades open-ended questions and excludes them from the score denominator', () => {
    const result = gradeQuizAttempt(
      [singleChoiceQ, openEndedQ] as any,
      { q1: 'a', q3: 'My essay answer' },
    );
    expect(result.breakdown.q3.correct).toBeNull();
    expect(result.totalObjective).toBe(1); // only the single-choice question counts
    expect(result.score).toBe(100); // got the only objective question right
    expect(result.hasOpenEndedQuestions).toBe(true);
  });

  it('returns a null score when the quiz has ONLY open-ended questions', () => {
    const result = gradeQuizAttempt([openEndedQ] as any, { q3: 'answer' });
    expect(result.score).toBeNull();
  });

  it('treats a missing/unanswered question as incorrect, not a crash', () => {
    const result = gradeQuizAttempt([singleChoiceQ] as any, {});
    expect(result.breakdown.q1.correct).toBe(false);
    expect(result.score).toBe(0);
  });

  it('computes a partial percentage score across multiple objective questions', () => {
    const q4 = { id: 'q4', type: QuestionType.SINGLE_CHOICE, options: [{ id: 'x', text: 'Right', isCorrect: true }, { id: 'y', text: 'Wrong', isCorrect: false }] };
    const result = gradeQuizAttempt(
      [singleChoiceQ, multiChoiceQ, q4] as any,
      { q1: 'a', q2: ['a'], q4: 'y' }, // 1 correct, 2 wrong out of 3
    );
    expect(result.correctCount).toBe(1);
    expect(result.totalObjective).toBe(3);
    expect(result.score).toBe(33); // rounded
  });
});

describe('QuizzesService — access gating', () => {
  function buildService() {
    const prisma = {
      quiz: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      question: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
      lesson: { findUnique: jest.fn() },
      quizAttempt: { create: jest.fn(), findMany: jest.fn() },
    };
    const enrollmentsService = { hasActiveAccess: jest.fn() };
    const service = new QuizzesService(prisma as any, enrollmentsService as any);
    return { service, prisma, enrollmentsService };
  }

  const STUDENT = { id: 'student-1', role: UserRole.STUDENT };

  it('blocks a student from taking a quiz attached to a course they are not enrolled in', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      randomize: false,
      questions: [],
    });
    prisma.lesson.findUnique.mockResolvedValue({
      chapter: { subject: { courseId: 'course-1' } },
    });
    enrollmentsService.hasActiveAccess.mockResolvedValue(false);

    await expect(service.getQuizForStudent('quiz-1', STUDENT)).rejects.toThrow(ForbiddenException);
  });

  it('allows a student to take an unattached (standalone) quiz with no gating', async () => {
    const { service, prisma, enrollmentsService } = buildService();
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      title: 'Practice Quiz',
      timeLimitMin: null,
      randomize: false,
      questions: [],
    });
    prisma.lesson.findUnique.mockResolvedValue(null); // not attached to any lesson

    const result = await service.getQuizForStudent('quiz-1', STUDENT);
    expect(result.title).toBe('Practice Quiz');
    expect(enrollmentsService.hasActiveAccess).not.toHaveBeenCalled();
  });

  it('never exposes isCorrect flags to the student', async () => {
    const { service, prisma } = buildService();
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      title: 'Quiz',
      timeLimitMin: 10,
      randomize: false,
      questions: [
        {
          id: 'q1',
          text: 'Capital of France?',
          type: QuestionType.SINGLE_CHOICE,
          options: [
            { id: 'a', text: 'Paris', isCorrect: true },
            { id: 'b', text: 'Rome', isCorrect: false },
          ],
        },
      ],
    });
    prisma.lesson.findUnique.mockResolvedValue(null);

    const result = await service.getQuizForStudent('quiz-1', STUDENT);
    // Cast to `any` here deliberately — `options` is typed loosely
    // (Prisma's Json field) at the type level, but we know the exact
    // runtime shape from the mock above. This mirrors the same
    // "real Prisma types are stricter than the sandbox mock" class of
    // issue fixed in support.service.ts — caught only once a real
    // build environment ran the full type-check.
    const optionKeys = Object.keys((result.questions[0].options as any)[0]);
    expect(optionKeys).not.toContain('isCorrect');
  });
});
