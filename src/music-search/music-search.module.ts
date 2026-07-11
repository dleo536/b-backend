import { Module } from '@nestjs/common';
import { MusicBrainzModule } from '../musicbrainz/musicbrainz.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { MusicSearchController } from './music-search.controller';
import { MusicSearchService } from './music-search.service';

@Module({
  imports: [MusicBrainzModule, SpotifyModule],
  controllers: [MusicSearchController],
  providers: [MusicSearchService],
})
export class MusicSearchModule {}
