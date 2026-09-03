import { IsDateString, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class SubmitAssignmentDto {
  // The file is uploaded to storage first via the Media module
  // (Phase 2), and its resulting URL is passed here.
  @IsString()
  fileUrl: string;
}

export class GradeSubmissionDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  grade: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
