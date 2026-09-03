import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { NotesService } from './notes.service';
import { CreateNoteBookmarkDto, UpdateNoteBookmarkDto } from './dto/engagement.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('notes')
export class NotesController {
  constructor(private notesService: NotesService) {}

  @Post()
  create(@Body() dto: CreateNoteBookmarkDto, @CurrentUser() user: ReqUser) {
    return this.notesService.create(user, dto);
  }

  @Get('mine')
  findAllMine(@CurrentUser() user: ReqUser) {
    return this.notesService.findAllMine(user.id);
  }

  @Get('lesson/:lessonId')
  findMineForLesson(@Param('lessonId') lessonId: string, @CurrentUser() user: ReqUser) {
    return this.notesService.findMineForLesson(user.id, lessonId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNoteBookmarkDto, @CurrentUser() user: ReqUser) {
    return this.notesService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.notesService.remove(id, user.id);
  }
}
