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
import { MusicMetadataService } from './music-metadata.service';

@Controller()
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class MetadataController {
  constructor(private readonly metadata: MusicMetadataService) {}
  @Get('search/albums')
  searchAlbums(
    @Query('query') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('market') market?: string,
  ) {
    return this.metadata.searchAlbums(query, limit, offset, market);
  }
  @Get('search/artists')
  searchArtists(
    @Query('query') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.metadata.searchArtists(query, limit, offset);
  }
  @Get('artists/:id/profile') getArtistProfile(@Param('id') id: string) {
    return this.metadata.getArtistProfile(id);
  }
}
