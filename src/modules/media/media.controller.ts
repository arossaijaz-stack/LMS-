import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { MediaService } from './media.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

class VideoUploadRequestDto {
  @IsString()
  title: string;
}

class FileUploadRequestDto {
  @IsString()
  fileName: string;

  @IsString()
  contentType: string;
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TEACHER)
@Controller('media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @Post('video-upload-url')
  createVideoUploadUrl(@Body() dto: VideoUploadRequestDto) {
    return this.mediaService.createVideoUploadUrl(dto.title);
  }

  @Post('file-upload-url')
  createFileUploadUrl(@Body() dto: FileUploadRequestDto) {
    return this.mediaService.createFileUploadUrl(dto.fileName, dto.contentType);
  }
}
