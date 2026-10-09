import { Injectable } from '@nestjs/common';
import { MusicMetadataService } from '../metadata/music-metadata.service';

@Injectable()
export class MusicSearchService {
  constructor(private readonly metadata: MusicMetadataService) {}
  searchAlbums(query: string, limit = 10, offset = 0, market?: string) {
    return this.metadata.searchAlbums(query, limit, offset, market);
  }
  searchArtists(query: string, limit = 10, offset = 0) {
    return this.metadata.searchArtists(query, limit, offset);
  }
}
