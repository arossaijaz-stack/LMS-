import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ProgramsModule } from './modules/programs/programs.module';
import { CoursesModule } from './modules/courses/courses.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { MediaModule } from './modules/media/media.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { QuizzesModule } from './modules/quizzes/quizzes.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { LiveClassesModule } from './modules/live-classes/live-classes.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { SupportModule } from './modules/support/support.module';
import { ThemingModule } from './modules/theming/theming.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit: 100 requests/minute per IP as a baseline against
    // casual abuse. Auth endpoints get a MUCH stricter limit via
    // @Throttle() overrides directly on AuthController (see that file) —
    // this was flagged as a gap since Phase 1 ("no rate-limiting yet on
    // login/register") and is closed here.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProgramsModule,
    CoursesModule,
    CurriculumModule,
    MediaModule,
    EnrollmentsModule,
    QuizzesModule,
    AssignmentsModule,
    LiveClassesModule,
    EngagementModule,
    NotificationsModule,
    CouponsModule,
    PaymentsModule,
    AdminDashboardModule,
    SupportModule,
    ThemingModule,
    HealthModule,
  ],
  providers: [
    // Registered globally: every route requires auth by default,
    // unless explicitly marked @Public().
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Rate limiting also applies globally, alongside auth — order
    // matters less here since Nest runs all APP_GUARD providers per
    // request regardless of registration order.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
