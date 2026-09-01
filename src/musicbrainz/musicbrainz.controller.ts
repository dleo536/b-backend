import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { MusicBrainzService } from './musicbrainz.service';

@Controller('musicbrainz')
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class MusicBrainzController {
  constructor(private readonly musicBrainzService: MusicBrainzService) {}

  @Get('albums/search')
  searchAlbums(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.musicBrainzService.searchAlbums(query, limit, offset);
  }

  @Get('artists/search')
  searchArtists(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.musicBrainzService.searchArtists(query, limit, offset);
  }

  @Get('artists/:artistMbid/profile')
  getArtistProfile(
    @Param('artistMbid') artistMbid: string,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
  ) {
    return this.musicBrainzService.getArtistProfile(artistMbid, limit);
  }

  @Get('release-groups/:id/cover-art')
  async getReleaseGroupCoverArt(@Param('id') id: string) {
    return {
      coverArtUrl: await this.musicBrainzService.getReleaseGroupCoverArt(id),
    };
  }
}
