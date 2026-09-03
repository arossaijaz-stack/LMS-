import { IsBoolean, IsDecimal, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { PricingType } from '@prisma/client';

export class CreateCourseDto {
  @IsUUID()
  programId: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  durationText?: string; // e.g. "2.5 Months"

  @IsEnum(PricingType)
  pricingType: PricingType;

  @IsNumberString()
  price: string; // sent as string, Prisma Decimal handles conversion

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsBoolean()
  isFreeTrial?: boolean;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  durationText?: string;

  @IsOptional()
  @IsEnum(PricingType)
  pricingType?: PricingType;

  @IsOptional()
  @IsNumberString()
  price?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsBoolean()
  isFreeTrial?: boolean;
}
