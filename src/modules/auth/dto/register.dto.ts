import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

// Public signup only ever creates STUDENT accounts.
// Staff roles (TEACHER, ADMIN, CAMPUS_MANAGER, etc.) are created
// by an existing Admin via the admin user-management screen (Phase 8),
// never through this open endpoint.
export class RegisterDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}

// Used internally by admin-created accounts (Phase 8 admin panel calls this,
// not the public /auth/register route).
export class CreateStaffUserDto extends RegisterDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  campusId?: string;
}
