import { Module } from '@nestjs/common';
import { MusicBrainzModule } from '../musicbrainz/musicbrainz.module';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { AlbumController } from './album.controller';

@Module({
  imports: [MusicBrainzModule],
  controllers: [AlbumController],
  providers: [SpotifyRateLimitGuard],
})
export class AlbumModule {}
