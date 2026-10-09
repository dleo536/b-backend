import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthUserContextService } from './auth-user-context.service';
import { User, UserRole } from '../user/user.entity';

describe('AuthUserContextService', () => {
  let userRepository: Pick<Repository<User>, 'findOne'>;
  let service: AuthUserContextService;

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
    };
    service = new AuthUserContextService(userRepository as Repository<User>);
  });

  it('builds the authenticated user for active profiles', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'app-user-1',
      roles: [UserRole.ADMIN],
      isSuspended: false,
    } as Partial<User>);

    const result = await service.buildAuthenticatedUser({
      uid: 'firebase-uid-1',
    } as any);

    expect(result.uid).toBe('firebase-uid-1');
    expect(result.appUserId).toBe('app-user-1');
    expect(result.roles).toEqual([UserRole.ADMIN]);
    expect(result.isAdmin).toBe(true);
  });

  it('defaults to the user role when no app profile exists yet', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue(null);

    const result = await service.buildAuthenticatedUser({
      uid: 'firebase-uid-1',
    } as any);

    expect(result.appUserId).toBeUndefined();
    expect(result.roles).toEqual([UserRole.USER]);
    expect(result.isAdmin).toBe(false);
  });

  it('rejects suspended authenticated users', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'app-user-1',
      roles: [UserRole.USER],
      isSuspended: true,
      suspendReason: 'Repeated abuse',
    } as Partial<User>);

    const buildUserPromise = service.buildAuthenticatedUser({
      uid: 'firebase-uid-1',
    } as any);

    await expect(buildUserPromise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(buildUserPromise).rejects.toThrow(
      'Your account has been suspended: Repeated abuse',
    );
  });

  it('grants the moderator role only to the designated verified Firebase identity', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'moderator-id',
      roles: [UserRole.USER],
    });
    const result = await service.buildAuthenticatedUser({
      uid: 'moderator-uid',
      email: 'Dannyapolistest@gmail.com',
      email_verified: true,
    } as any);
    expect(result.roles).toEqual([UserRole.USER, UserRole.MOD]);
    expect(result.isAdmin).toBe(false);
  });

  it.each([
    { email: 'someone@example.com', email_verified: true },
    { email: 'dannyapolisttest@gmail.com', email_verified: true },
    { email: 'dannyapolistest@gmail.com', email_verified: false },
    { email: 'dannyapolistest@gmail.com' },
  ])(
    'ignores stored moderator roles and profile emails for ineligible identities: %j',
    async (token) => {
      (userRepository.findOne as jest.Mock).mockResolvedValue({
        id: 'user-id',
        email: 'dannyapolistest@gmail.com',
        roles: [UserRole.MOD],
      });
      const result = await service.buildAuthenticatedUser({
        uid: 'other-uid',
        ...token,
      } as any);
      expect(result.roles).toEqual([UserRole.USER]);
    },
  );

  it('does not grant repair access before an app profile exists', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue(null);
    const result = await service.buildAuthenticatedUser({
      uid: 'new-uid',
      email: 'dannyapolistest@gmail.com',
      email_verified: true,
    } as any);
    expect(result.roles).toEqual([UserRole.USER]);
  });

  it('rejects suspended admins before allowing admin actions', async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'app-user-1',
      roles: [UserRole.ADMIN],
      isSuspended: true,
    } as Partial<User>);

    const adminCheckPromise = service.requireAdminByOauthId('firebase-uid-1');

    await expect(adminCheckPromise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(adminCheckPromise).rejects.toThrow(
      'Your account has been suspended',
    );
  });
});
