import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BrandSettingsService } from './brand-settings.service';
import { UpdateBrandSettingsDto } from './dto/theming.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('brand-settings')
export class BrandSettingsController {
  constructor(private brandSettingsService: BrandSettingsService) {}

  @Public()
  @Get()
  getCurrent() {
    return this.brandSettingsService.getCurrent();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch()
  update(@Body() dto: UpdateBrandSettingsDto) {
    return this.brandSettingsService.update(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('preview')
  preview(@Body() dto: UpdateBrandSettingsDto) {
    return this.brandSettingsService.preview(dto);
  }
}
