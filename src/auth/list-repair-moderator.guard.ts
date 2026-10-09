import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth-user.interface';
import { assertListRepairModerator } from './list-repair-moderator';

@Injectable()
export class ListRepairModeratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    assertListRepairModerator(request.user!);
    return true;
  }
}
