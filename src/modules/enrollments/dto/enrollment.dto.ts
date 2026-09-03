import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EnrollmentStatus } from '@prisma/client';

export class CreateEnrollmentDto {
  @IsUUID()
  courseId: string;
}

export class UpdateEnrollmentStatusDto {
  @IsEnum(EnrollmentStatus)
  status: EnrollmentStatus;
}

export class CreateTransferRequestDto {
  @IsUUID()
  requestedCourseId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewTransferRequestDto {
  @IsEnum(['APPROVED', 'REJECTED'] as const)
  decision: 'APPROVED' | 'REJECTED';
}
