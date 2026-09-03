import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true preserves the exact raw request body alongside Nest's
  // normal JSON parsing, accessible via req.rawBody — required for real
  // webhook signature verification (see PaymentsController).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Sets standard security headers (X-Content-Type-Options,
  // X-Frame-Options, Strict-Transport-Security, etc.) — cheap, standard
  // hardening with no behavior tradeoffs for an API server.
  app.use(helmet());

  // Strips unknown fields and auto-validates every DTO marked with
  // class-validator decorators (RegisterDto, LoginDto, etc.)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 4000);
  console.log(`API running on http://localhost:${process.env.PORT ?? 4000}/api`);
}
bootstrap();
