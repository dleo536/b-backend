import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { AlbumController } from './album.controller';

@Module({
  imports: [MetadataModule],
  controllers: [AlbumController],
  providers: [SpotifyRateLimitGuard],
})
export class AlbumModule {}
