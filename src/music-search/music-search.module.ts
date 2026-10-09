import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module';
import { MusicSearchController } from './music-search.controller';
import { MusicSearchService } from './music-search.service';

@Module({
  imports: [MetadataModule],
  controllers: [MusicSearchController],
  providers: [MusicSearchService],
})
export class MusicSearchModule {}
