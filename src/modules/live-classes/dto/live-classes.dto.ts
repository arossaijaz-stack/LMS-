import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

// ---------- Batches ----------

export class CreateBatchDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AddStudentToBatchDto {
  @IsUUID()
  userId: string;
}

// ---------- Live sessions ----------

export class CreateLiveSessionDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsDateString()
  scheduledAt: string;
}

export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class MarkAttendanceDto {
  @IsBoolean()
  present: boolean;
}

export class SetRecordingDto {
  @IsString()
  recordingUrl: string;
}
