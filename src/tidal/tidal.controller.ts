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
import { TidalService } from './tidal.service';

@Controller('tidal')
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class TidalController {
  constructor(private readonly tidalService: TidalService) {}

  @Get('albums/search')
  searchAlbums(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('countryCode') countryCode?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.tidalService.searchAlbums(query, limit, countryCode, cursor);
  }
}
