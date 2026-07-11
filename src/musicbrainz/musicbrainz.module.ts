import { Module } from '@nestjs/common';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { MusicBrainzController } from './musicbrainz.controller';
import { MusicBrainzService } from './musicbrainz.service';

@Module({
  controllers: [MusicBrainzController],
  providers: [MusicBrainzService, SpotifyRateLimitGuard],
  exports: [MusicBrainzService],
})
export class MusicBrainzModule {}
