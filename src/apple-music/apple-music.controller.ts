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
import { AppleMusicService } from './apple-music.service';

@Controller('apple-music')
@UseGuards(FirebaseAuthGuard, SpotifyRateLimitGuard)
export class AppleMusicController {
  constructor(private readonly appleMusicService: AppleMusicService) {}

  @Get('albums/search')
  searchAlbums(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('storefront') storefront?: string,
    @Query('countryCode') countryCode?: string,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.appleMusicService.searchAlbums(
      query,
      limit,
      storefront || countryCode,
      offset,
    );
  }
}
