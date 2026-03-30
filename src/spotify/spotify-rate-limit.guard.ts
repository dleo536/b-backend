import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth-user.interface';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class SpotifyRateLimitGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly maxRequestsPerWindow = 180;
  private readonly buckets = new Map<string, RateLimitBucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actorKey = request.user?.uid?.trim() || request.ip || 'unknown';
    const now = Date.now();

    this.pruneExpiredBuckets(now);

    const currentBucket = this.buckets.get(actorKey);
    if (!currentBucket || currentBucket.resetAt <= now) {
      this.buckets.set(actorKey, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return true;
    }

    if (currentBucket.count >= this.maxRequestsPerWindow) {
      throw new HttpException(
        'Too many Spotify requests. Please slow down and try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    currentBucket.count += 1;
    this.buckets.set(actorKey, currentBucket);
    return true;
  }

  private pruneExpiredBuckets(now: number) {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
