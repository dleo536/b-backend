import { Module } from '@nestjs/common';
import { AppleMusicModule } from '../apple-music/apple-music.module';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { MusicBrainzController } from './musicbrainz.controller';
import { MusicBrainzService } from './musicbrainz.service';

@Module({
  imports: [AppleMusicModule],
  controllers: [MusicBrainzController],
  providers: [MusicBrainzService, SpotifyRateLimitGuard],
  exports: [MusicBrainzService],
})
export class MusicBrainzModule {}
