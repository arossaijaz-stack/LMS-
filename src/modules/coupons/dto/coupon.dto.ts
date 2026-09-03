import { IsBoolean, IsDateString, IsInt, IsNumberString, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  code: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumberString()
  discountAmount?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
