import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { MusicMetadataService } from '../metadata/music-metadata.service';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';

@Controller('albums')
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class AlbumController {
  constructor(private readonly metadata: MusicMetadataService) {}

  @Get(':id')
  getAlbum(@Param('id') id: string) {
    return this.metadata.getAlbumDetails(id);
  }

  @Get(':id/cover-art')
  getCoverArt(@Param('id') id: string) {
    return this.metadata.getCoverArt(id);
  }

  @Get(':releaseGroupMbid/tracks')
  getAlbumTracks(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.metadata.getAlbumTracks(releaseGroupMbid);
  }

  @Get(':releaseGroupMbid/other-albums')
  getOtherAlbums(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.metadata.getOtherAlbums(releaseGroupMbid);
  }

  @Get(':releaseGroupMbid/artist-image')
  getAlbumArtistImage(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.metadata.getAlbumArtistImage(releaseGroupMbid);
  }

  @Get(':releaseGroupMbid/personnel')
  getAlbumPersonnel(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.metadata.getAlbumPersonnel(releaseGroupMbid);
  }
}
