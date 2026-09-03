import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentProviderService } from './payment-provider.service';
import { CouponsModule } from '../coupons/coupons.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CouponsModule, EnrollmentsModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderService],
})
export class PaymentsModule {}
