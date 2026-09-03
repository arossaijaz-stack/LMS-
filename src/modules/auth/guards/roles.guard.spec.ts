import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@prisma/client';

function buildContext(user: any, requiredRoles: UserRole[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
  return { reflector, context };
}

describe('RolesGuard', () => {
  it('allows access when the route has no @Roles() decorator', () => {
    const { reflector, context } = buildContext({ role: UserRole.STUDENT }, undefined);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user role is in the required list', () => {
    const { reflector, context } = buildContext(
      { role: UserRole.ADMIN },
      [UserRole.ADMIN, UserRole.CAMPUS_MANAGER],
    );
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the user role is NOT in the required list', () => {
    const { reflector, context } = buildContext({ role: UserRole.STUDENT }, [UserRole.ADMIN]);
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no user on the request at all', () => {
    const { reflector, context } = buildContext(undefined, [UserRole.ADMIN]);
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
