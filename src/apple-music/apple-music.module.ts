import { Module } from '@nestjs/common';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { AppleMusicController } from './apple-music.controller';
import { AppleMusicService } from './apple-music.service';

@Module({
  controllers: [AppleMusicController],
  providers: [AppleMusicService, SpotifyRateLimitGuard],
  exports: [AppleMusicService],
})
export class AppleMusicModule {}
