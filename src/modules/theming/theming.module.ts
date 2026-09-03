import { Module } from '@nestjs/common';
import { BrandSettingsService } from './brand-settings.service';
import { BrandSettingsController } from './brand-settings.controller';
import { ContentBlocksService } from './content-blocks.service';
import { ContentBlocksController } from './content-blocks.controller';

@Module({
  controllers: [BrandSettingsController, ContentBlocksController],
  providers: [BrandSettingsService, ContentBlocksService],
})
export class ThemingModule {}
