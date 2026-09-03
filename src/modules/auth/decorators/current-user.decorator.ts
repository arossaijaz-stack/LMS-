import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Usage: @CurrentUser() user: AuthUser in any controller method,
// once the request has passed through JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
