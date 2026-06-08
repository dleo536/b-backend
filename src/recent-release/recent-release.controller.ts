import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../auth/optional-firebase-auth.guard';
import {
  CreateRecentReleaseAlbumDto,
  CreateRecentReleaseAlbumsDto,
} from './dto/create-recent-release-album.dto';
import {
  toRecentReleaseAlbumResponse,
  toRecentReleaseAlbumResponses,
} from './recent-release-response';
import { RecentReleaseService } from './recent-release.service';

@Controller()
export class RecentReleaseController {
  constructor(private readonly recentReleaseService: RecentReleaseService) {}

  @UseGuards(OptionalFirebaseAuthGuard)
  @Get('recent-release-albums')
  findAll(
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.recentReleaseService.findAll(limit, offset).then((result) => ({
      ...result,
      data: toRecentReleaseAlbumResponses(result.data),
    }));
  }

  @UseGuards(FirebaseAuthGuard, AdminGuard)
  @Post('admin/recent-release-albums')
  create(
    @Body()
    createDto:
      | CreateRecentReleaseAlbumDto
      | CreateRecentReleaseAlbumsDto
      | CreateRecentReleaseAlbumDto[],
  ) {
    const bulkAlbums = Array.isArray(createDto)
      ? createDto
      : Array.isArray((createDto as CreateRecentReleaseAlbumsDto)?.albums)
        ? (createDto as CreateRecentReleaseAlbumsDto).albums
        : null;

    if (bulkAlbums) {
      return this.recentReleaseService
        .createMany(bulkAlbums)
        .then((albums) => ({
          data: toRecentReleaseAlbumResponses(albums),
          totalCount: albums.length,
        }));
    }

    return this.recentReleaseService
      .create(createDto as CreateRecentReleaseAlbumDto)
      .then(toRecentReleaseAlbumResponse);
  }

  @UseGuards(FirebaseAuthGuard, AdminGuard)
  @Delete('admin/recent-release-albums/:spotifyAlbumId')
  remove(@Param('spotifyAlbumId') spotifyAlbumId: string) {
    return this.recentReleaseService.removeBySpotifyAlbumId(spotifyAlbumId);
  }
}
