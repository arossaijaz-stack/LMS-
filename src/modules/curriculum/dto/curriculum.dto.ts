import { IsEnum, IsOptional, IsString, IsUUID, MinLength, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { LessonType } from '@prisma/client';

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  title: string;
}

export class CreateChapterDto {
  @IsString()
  @MinLength(1)
  title: string;
}

export class CreateLessonDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsEnum(LessonType)
  type: LessonType;

  // Only the field matching `type` is expected to be filled in;
  // the others stay null. Video/reading content is uploaded separately
  // via the media module, then the returned URL is passed here.
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  readingBody?: string;

  @IsOptional()
  @IsUUID()
  quizId?: string;

  @IsOptional()
  @IsUUID()
  assignmentId?: string;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  readingBody?: string;

  // Attach an existing Quiz/Assignment (created via their own modules)
  // to this lesson. Since Lesson.quizId/assignmentId are unique, this
  // effectively "links" a quiz or assignment to exactly one lesson.
  @IsOptional()
  @IsUUID()
  quizId?: string;

  @IsOptional()
  @IsUUID()
  assignmentId?: string;
}

// ---------- Reordering (drag-and-drop from the admin curriculum builder) ----------

class ReorderItem {
  @IsUUID()
  id: string;

  @IsInt()
  order: number;
}

export class ReorderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items: ReorderItem[];
}
