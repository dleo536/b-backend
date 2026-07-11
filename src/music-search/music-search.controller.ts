import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { MusicSearchService } from './music-search.service';

@Controller('music-search')
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class MusicSearchController {
  constructor(private readonly musicSearchService: MusicSearchService) {}

  @Get('albums/search')
  searchAlbums(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('market') market?: string,
  ) {
    return this.musicSearchService.searchAlbums(query, limit, offset, market);
  }

  @Get('artists/search')
  searchArtists(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.musicSearchService.searchArtists(query, limit, offset);
  }
}
