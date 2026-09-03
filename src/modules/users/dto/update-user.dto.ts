import { IsOptional, IsString } from 'class-validator';

// Fields a user can update on their own profile.
// Role/email changes are intentionally excluded — those require
// an admin action (Phase 8) to prevent self-privilege-escalation.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
