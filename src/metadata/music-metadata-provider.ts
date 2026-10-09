export type MetadataProviderName = 'spotify' | 'musicbrainz';

// Keep the existing mobile shapes while carrying both providers' identities.
export type MetadataAlbum = Record<string, any> & {
  id: string;
  name: string;
  source: MetadataProviderName;
};
export type MetadataArtist = Record<string, any> & {
  id: string;
  name: string;
  source: MetadataProviderName;
};

export interface MusicMetadataProvider {
  readonly name: MetadataProviderName;
  searchAlbums(
    query: string,
    limit?: number,
    offset?: number,
    market?: string,
  ): Promise<MetadataAlbum[]>;
  searchArtists(
    query: string,
    limit?: number,
    offset?: number,
  ): Promise<MetadataArtist[]>;
  getAlbumDetails(id: string): Promise<MetadataAlbum>;
  getAlbumTracks(id: string): Promise<Record<string, any>>;
  getArtistDetails(id: string): Promise<MetadataArtist>;
  getArtistAlbums(id: string): Promise<MetadataAlbum[]>;
}
