import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Usage: @Public() on login/register/forgot-password routes so the
// global JwtAuthGuard skips them.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
