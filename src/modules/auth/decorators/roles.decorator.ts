import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Usage on any controller route:
//   @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
//   @Get('reports')
//   getReports() { ... }
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
