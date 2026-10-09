import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListService } from './list.service';
import { ListController } from './list.controller';
import { AdminListController } from './admin-list.controller';
import { AlbumList } from './list.entity';
import { User } from '../user/user.entity';
import { UserFollow } from '../user/follow.entity';
import { ListLike } from './list-like.entity';
import { MetadataModule } from '../metadata/metadata.module';
import { SpotifyModule } from '../spotify/spotify.module';
import { ModeratorListController } from './moderator-list.controller';
import { ListAlbumRepairService } from './list-album-repair.service';
import { ModeratorListService } from './moderator-list.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlbumList, User, UserFollow, ListLike]),
    MetadataModule,
    SpotifyModule,
  ],
  controllers: [ListController, AdminListController, ModeratorListController],
  providers: [ListService, ListAlbumRepairService, ModeratorListService],
})
export class ListModule {}
