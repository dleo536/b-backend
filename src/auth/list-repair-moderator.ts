import { ForbiddenException } from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { AuthenticatedUser } from './auth-user.interface';

// A single account is eligible. Trust Firebase's verified token email, never
// the editable profile email or roles supplied by a mobile request.
const LIST_REPAIR_MODERATOR_EMAIL = 'dannyapolisttest@gmail.com';

export const isDesignatedModeratorEmail = (email?: string) =>
  email?.trim().toLowerCase() === LIST_REPAIR_MODERATOR_EMAIL;

export function isListRepairModerator(token: DecodedIdToken): boolean {
  return (
    token.email_verified === true && isDesignatedModeratorEmail(token.email)
  );
}

export function assertListRepairModerator(user: AuthenticatedUser) {
  if (!user?.appUserId || !isListRepairModerator(user)) {
    throw new ForbiddenException('List repair moderator access required');
  }
}
