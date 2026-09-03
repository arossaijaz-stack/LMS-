import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

class QuestionOptionDto {
  @IsString()
  id: string; // client-generated short id, e.g. "a", "b", "c" — referenced in student answers

  @IsString()
  text: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class CreateQuestionDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  // Required for SINGLE_CHOICE / MULTI_CHOICE, omitted for OPEN_ENDED
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  // Only meaningful for OPEN_ENDED — a reference answer for the teacher
  // reviewing submissions manually; never used for auto-grading.
  @IsOptional()
  @IsString()
  correctAnswer?: string;
}

export class CreateQuizDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsInt()
  timeLimitMin?: number;

  @IsOptional()
  @IsBoolean()
  randomize?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  timeLimitMin?: number;

  @IsOptional()
  @IsBoolean()
  randomize?: boolean;
}

// Student's answer for one question: a single option id (SINGLE_CHOICE),
// an array of option ids (MULTI_CHOICE), or free text (OPEN_ENDED).
export class SubmitQuizAttemptDto {
  @IsObject()
  answers: Record<string, string | string[]>;
}
