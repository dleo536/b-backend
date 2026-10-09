import { Injectable, NotFoundException } from '@nestjs/common';
import { MusicBrainzService } from '../musicbrainz/musicbrainz.service';
import type { MusicMetadataProvider } from './music-metadata-provider';

@Injectable()
export class MusicBrainzProvider implements MusicMetadataProvider {
  readonly name = 'musicbrainz' as const;
  constructor(private readonly service: MusicBrainzService) {}
  async searchAlbums(query: string, limit = 10, offset = 0) {
    const result = await this.service.searchAlbums(query, limit, offset);
    if (!Array.isArray(result))
      throw new NotFoundException('MusicBrainz is unavailable');
    return result;
  }
  async searchArtists(query: string, limit = 10, offset = 0) {
    const result = await this.service.searchArtists(query, limit, offset);
    if (!Array.isArray(result))
      throw new NotFoundException('MusicBrainz is unavailable');
    return result;
  }
  async getAlbumDetails(id: string) {
    const result = await this.service.getReleaseGroupAlbum(id);
    if (!result) throw new NotFoundException('MusicBrainz album not found');
    return result;
  }
  getAlbumTracks(id: string) {
    return this.service.getAlbumTracks(id);
  }
  async getArtistDetails(id: string) {
    const result = await this.service.getArtistProfile(id);
    if (!result) throw new NotFoundException('MusicBrainz artist not found');
    return result;
  }
  async getArtistAlbums(id: string) {
    return (await this.getArtistDetails(id)).catalog || [];
  }
}
