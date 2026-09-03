import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  // Liveness check — "is the process running at all". Used by uptime
  // monitors (UptimeRobot, Better Stack, etc.) and Netlify Function
  // warm-up pings.
  @Public()
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  // Readiness check — "can this instance actually serve real requests
  // right now", i.e. is the database reachable. Useful to distinguish
  // "app is up but DB connection is down" from "app is fully healthy" —
  // a plain /health returning 200 wouldn't catch a Supabase connection
  // pool exhaustion or credential issue.
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      return { status: 'error', database: 'disconnected' };
    }
  }
}
