import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DecodedIdToken } from 'firebase-admin/auth';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from './auth-user.interface';
import { User, UserRole } from '../user/user.entity';
import { isListRepairModerator } from './list-repair-moderator';

@Injectable()
export class AuthUserContextService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private normalizeRoles(roles?: User['roles']): UserRole[] {
    if (!Array.isArray(roles) || roles.length === 0) {
      return [UserRole.USER];
    }

    return Array.from(new Set(roles));
  }

  private ensureUserIsActive(user: User | null) {
    if (!user?.isSuspended) {
      return;
    }

    const suspendReason = user.suspendReason?.trim();
    throw new ForbiddenException(
      suspendReason
        ? `Your account has been suspended: ${suspendReason}`
        : 'Your account has been suspended',
    );
  }

  async buildAuthenticatedUser(
    decodedToken: DecodedIdToken,
  ): Promise<AuthenticatedUser> {
    const appUser = await this.userRepository.findOne({
      where: { oauthId: decodedToken.uid },
    });
    this.ensureUserIsActive(appUser);
    const roles: UserRole[] = this.normalizeRoles(appUser?.roles).filter(
      (role) => role !== UserRole.MOD,
    );
    if (appUser && isListRepairModerator(decodedToken))
      roles.push(UserRole.MOD);
    if (!roles.length) roles.push(UserRole.USER);

    return {
      ...(decodedToken as AuthenticatedUser),
      uid: decodedToken.uid,
      appUserId: appUser?.id,
      roles,
      isAdmin: roles.includes(UserRole.ADMIN),
    };
  }

  async requireAdminByOauthId(oauthId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { oauthId },
    });

    if (!user) {
      throw new NotFoundException('Authenticated user profile not found');
    }

    this.ensureUserIsActive(user);

    const roles = this.normalizeRoles(user.roles);
    if (!roles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException('Admin access required');
    }

    return user;
  }
}
