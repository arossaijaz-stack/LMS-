import { Module } from '@nestjs/common';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [EnrollmentsModule],
  controllers: [NotesController, ProgressController, LeaderboardController, SearchController],
  providers: [NotesService, ProgressService, LeaderboardService, SearchService],
})
export class EngagementModule {}
