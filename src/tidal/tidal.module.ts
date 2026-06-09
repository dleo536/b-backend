import { Module } from '@nestjs/common';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { TidalController } from './tidal.controller';
import { TidalService } from './tidal.service';

@Module({
  controllers: [TidalController],
  providers: [TidalService, SpotifyRateLimitGuard],
  exports: [TidalService],
})
export class TidalModule {}
