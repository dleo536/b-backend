import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { MusicBrainzService } from '../musicbrainz/musicbrainz.service';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';

@Controller('albums')
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class AlbumController {
  constructor(private readonly musicBrainzService: MusicBrainzService) {}

  @Get(':releaseGroupMbid/tracks')
  getAlbumTracks(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.musicBrainzService.getAlbumTracks(releaseGroupMbid);
  }

  @Get(':releaseGroupMbid/other-albums')
  getOtherAlbums(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.musicBrainzService.getOtherAlbums(releaseGroupMbid);
  }

  @Get(':releaseGroupMbid/personnel')
  getAlbumPersonnel(@Param('releaseGroupMbid') releaseGroupMbid: string) {
    return this.musicBrainzService.getAlbumPersonnel(releaseGroupMbid);
  }
}
