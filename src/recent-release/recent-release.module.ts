import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotifyModule } from '../spotify/spotify.module';
import { RecentReleaseAlbum } from './recent-release-album.entity';
import { RecentReleaseController } from './recent-release.controller';
import { RecentReleaseService } from './recent-release.service';

@Module({
  imports: [TypeOrmModule.forFeature([RecentReleaseAlbum]), SpotifyModule],
  controllers: [RecentReleaseController],
  providers: [RecentReleaseService],
})
export class RecentReleaseModule {}
