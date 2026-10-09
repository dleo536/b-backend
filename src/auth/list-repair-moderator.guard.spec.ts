import { ForbiddenException } from '@nestjs/common';
import { ListRepairModeratorGuard } from './list-repair-moderator.guard';

describe('list repair moderator authorization', () => {
  const guard = new ListRepairModeratorGuard();
  const activate = (user: any) =>
    guard.canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any);
  it('allows only the verified designated account with an app profile', () => {
    expect(
      activate({
        uid: 'uid',
        appUserId: 'profile',
        email: 'dannyapolistest@gmail.com',
        email_verified: true,
      }),
    ).toBe(true);
  });
  it.each([
    undefined,
    {
      appUserId: 'profile',
      email: 'dannyapolisttest@gmail.com',
      email_verified: true,
    },
    {
      roles: ['mod'],
      appUserId: 'profile',
      email: 'other@example.com',
      email_verified: true,
    },
    {
      roles: ['admin'],
      isAdmin: true,
      appUserId: 'profile',
      email: 'other@example.com',
      email_verified: true,
    },
    {
      appUserId: 'profile',
      email: 'dannyapolistest@gmail.com',
      email_verified: false,
    },
    { email: 'dannyapolistest@gmail.com', email_verified: true },
  ])('rejects unauthorized requests: %j', (user) => {
    expect(() => activate(user)).toThrow(ForbiddenException);
  });
});
