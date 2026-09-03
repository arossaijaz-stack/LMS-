import { Module } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';
import { LiveSessionsService } from './live-sessions.service';
import { LiveSessionsController } from './live-sessions.controller';
import { LiveClassProviderService } from './live-class-provider.service';
import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [EnrollmentsModule],
  controllers: [BatchesController, LiveSessionsController],
  providers: [BatchesService, LiveSessionsService, LiveClassProviderService],
  exports: [BatchesService],
})
export class LiveClassesModule {}
