import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

// No @Public() here — the global JwtAuthGuard applies, so every
// route in this controller requires a valid access token by default.
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ---------- Self-service (any authenticated user) ----------

  @Get('me')
  getMyProfile(@CurrentUser() user: { id: string }) {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateUserDto) {
    return this.usersService.updateOwnProfile(user.id, dto);
  }

  // ---------- Admin / Campus Manager only ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CAMPUS_MANAGER)
  @Get()
  listUsers(
    @Query('role') role?: UserRole,
    @Query('campusId') campusId?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.listUsers({ role, campusId, search });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  updateUserByAdmin(
    @Param('id') id: string,
    @Body() data: { role?: UserRole; campusId?: string },
  ) {
    return this.usersService.updateUserByAdmin(id, data);
  }
}
