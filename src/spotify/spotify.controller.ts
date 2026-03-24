import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { SpotifyService } from './spotify.service';

@Controller('spotify')
export class SpotifyController {
  constructor(private readonly spotifyService: SpotifyService) {}

  @Get('albums/search')
  searchAlbums(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('market') market?: string,
  ) {
    return this.spotifyService.searchAlbums(query, limit, offset, market);
  }

  @Get('albums/:id')
  getAlbum(@Param('id') id: string) {
    return this.spotifyService.getAlbum(id);
  }

  @Get('albums/:id/tracks')
  getAlbumTracks(@Param('id') id: string) {
    return this.spotifyService.getAlbumTracks(id);
  }

  @Get('artists/search')
  searchArtists(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.spotifyService.searchArtists(query, limit, offset);
  }

  @Get('artists/by-name')
  getArtistByName(@Query('name') name: string) {
    return this.spotifyService.getArtistByName(name);
  }

  @Get('artists/:id/albums')
  getArtistAlbums(@Param('id') id: string) {
    return this.spotifyService.getArtistAlbums(id);
  }

  @Get('artists/:id')
  getArtistById(@Param('id') id: string) {
    return this.spotifyService.getArtistById(id);
  }
}
