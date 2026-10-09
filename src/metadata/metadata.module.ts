import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicBrainzModule } from '../musicbrainz/musicbrainz.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { Review } from '../review/review.entity';
import { MetadataAlbumEntity } from './metadata-album.entity';
import { MetadataArtistEntity } from './metadata-artist.entity';
import { MetadataCatalogService } from './metadata-catalog.service';
import { MusicMetadataService } from './music-metadata.service';
import { MusicBrainzProvider } from './musicbrainz.provider';
import { SpotifyProvider } from './spotify.provider';
import { MetadataController } from './metadata.controller';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MetadataAlbumEntity,
      MetadataArtistEntity,
      Review,
    ]),
    MusicBrainzModule,
    SpotifyModule,
  ],
  controllers: [MetadataController],
  providers: [
    MetadataCatalogService,
    MusicMetadataService,
    MusicBrainzProvider,
    SpotifyProvider,
    SpotifyRateLimitGuard,
  ],
  exports: [MetadataCatalogService, MusicMetadataService],
})
export class MetadataModule {}
