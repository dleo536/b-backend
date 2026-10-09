import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ListRepairModeratorGuard } from '../auth/list-repair-moderator.guard';
import type { AuthenticatedUser } from '../auth/auth-user.interface';
import { SpotifyRateLimitGuard } from '../spotify/spotify-rate-limit.guard';
import { ListAlbumRepairService } from './list-album-repair.service';
import { ModeratorListService } from './moderator-list.service';
import {
  AddModeratorAlbumDto,
  EditModeratorAlbumsDto,
} from './dto/moderator-albums.dto';
import {
  ApplyAlbumRepairDto,
  PreviewAlbumRepairDto,
} from './dto/repair-album.dto';

@Controller('moderator/lists')
@UseGuards(FirebaseAuthGuard, ListRepairModeratorGuard, SpotifyRateLimitGuard)
export class ModeratorListController {
  constructor(
    private readonly repairs: ListAlbumRepairService,
    private readonly lists: ModeratorListService,
  ) {}
  @Post(':id/albums')
  addAlbum(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AddModeratorAlbumDto,
  ) {
    return this.lists.addAlbum(user, id, input.albumId);
  }
  @Patch(':id/albums')
  editAlbums(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EditModeratorAlbumsDto,
  ) {
    return this.lists.editAlbums(user, id, input);
  }
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('query') query = '',
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    return this.repairs.findLists(
      user,
      query.slice(0, 120),
      Math.min(Math.max(offset, 0), 100000),
    );
  }
  @Get(':id')
  getList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.repairs.getList(user, id);
  }
  @Post(':id/album-repairs/preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PreviewAlbumRepairDto,
  ) {
    return this.repairs.preview(user, id, input);
  }
  @Post(':id/album-repairs/apply')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ApplyAlbumRepairDto,
  ) {
    return this.repairs.apply(user, id, input);
  }
  @Get(':id/album-repairs')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.repairs.history(user, id);
  }
  @Post(':id/album-repairs/:auditId/undo')
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('auditId', ParseUUIDPipe) auditId: string,
  ) {
    return this.repairs.undo(user, id, auditId);
  }
}
