import { Module } from '@nestjs/common';
import { SpotifyController } from './spotify.controller';
import { SpotifyService } from './spotify.service';
import { SpotifyRateLimitGuard } from './spotify-rate-limit.guard';

@Module({
  controllers: [SpotifyController],
  providers: [SpotifyService, SpotifyRateLimitGuard],
  exports: [SpotifyService],
})
export class SpotifyModule {}
