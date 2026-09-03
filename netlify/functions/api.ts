// Wraps the entire NestJS app as a single Netlify Function, so every
// /api/* route is handled by one Lambda under the hood.
//
// IMPORTANT CAVEATS — read before relying on this in production:
// 1. Cold starts: the first request after a period of inactivity pays
//    the full NestJS bootstrap cost (module init, Prisma connect) —
//    typically 1-3 seconds. `cachedHandler` below reuses the bootstrapped
//    app across warm invocations to minimize this, but a cold start is
//    unavoidable on serverless.
// 2. Execution timeout: Netlify's free/Pro tier caps a function at 10
//    seconds (26s for background functions, which don't return a
//    response inline — not usable for a request/response API). A slow
//    Prisma query or an unresponsive Supabase pooler could hit this.
// 3. No persistent WebSocket/long-polling support — not needed by this
//    API today, but worth knowing if a future phase adds real-time
//    features (e.g. live class chat).
// 4. If traffic grows significantly, moving the backend to a
//    persistent-process host (Railway, Render, Fly.io) removes all of
//    the above constraints — Netlify would then serve ONLY the
//    frontend, which is what Netlify is actually optimized for. This
//    function exists to make the user's stated initial plan (backend +
//    frontend both on Netlify) work correctly for an MVP/launch, not as
//    a permanent architecture recommendation for scale.
import serverless from 'serverless-http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
const express = require('express');
import helmet from 'helmet';
// IMPORTANT: import from the compiled dist/ output, NOT from
// TypeScript source (../../src/app.module). This was the actual
// cause of a "Cannot read properties of undefined (reading 'get')"
// boot-time crash: Netlify's esbuild-based function bundler compiles
// any .ts file it's given directly, but esbuild does NOT implement
// TypeScript's emitDecoratorMetadata option, which NestJS's
// dependency injection relies on to know a constructor parameter's
// type (e.g. that JwtAccessStrategy's `config` parameter should
// receive a ConfigService). Without that metadata, Nest can't resolve
// the injection and passes undefined, so any constructor that calls
// config.get(...) synchronously (see the Passport strategies) fails
// immediately at bootstrap. Importing the already-tsc-compiled dist/
// output instead means the metadata is already baked in as real
// executable JS (__metadata(...) calls) by the time esbuild touches
// it, so esbuild is just bundling plain JavaScript, not
// re-transforming TypeScript, and nothing gets stripped.
import { AppModule } from '../../dist/app.module';

let cachedHandler: ReturnType<typeof serverless> | null = null;

async function bootstrapServer() {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);

  const app = await NestFactory.create(AppModule, adapter, { rawBody: true });

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? '*',
    credentials: true,
  });
  app.setGlobalPrefix('api');

  await app.init();
  return serverless(expressApp);
}

export const handler = async (event: any, context: any) => {
  // Let Netlify's Lambda runtime return as soon as the response is sent,
  // rather than waiting for Node's event loop to fully drain (which
  // would otherwise hang on Prisma's open connection).
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cachedHandler) {
    cachedHandler = await bootstrapServer();
  }
  return cachedHandler(event, context);
};
