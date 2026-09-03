import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateNoteBookmarkDto {
  @IsUUID()
  lessonId: string;

  @IsIn(['note', 'bookmark'])
  type: 'note' | 'bookmark';

  // Required for notes (the note text), unused for bookmarks.
  @IsOptional()
  @IsString()
  content?: string;
}

export class UpdateNoteBookmarkDto {
  @IsString()
  @MinLength(1)
  content: string;
}
