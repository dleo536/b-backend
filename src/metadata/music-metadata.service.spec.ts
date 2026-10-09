import { ConflictException } from '@nestjs/common';
import { MusicMetadataService } from './music-metadata.service';
import { MetadataCatalogService } from './metadata-catalog.service';
const mbid = '11111111-1111-4111-8111-111111111111';
const spotifyId = '1234567890123456789012';
describe('MusicMetadataService provider switch', () => {
  const original = process.env.MUSIC_METADATA_PROVIDER;
  const originalLegacy = process.env.MUSIC_SEARCH_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.MUSIC_METADATA_PROVIDER;
    else process.env.MUSIC_METADATA_PROVIDER = original;
    if (originalLegacy === undefined) delete process.env.MUSIC_SEARCH_PROVIDER;
    else process.env.MUSIC_SEARCH_PROVIDER = originalLegacy;
  });
  function setup(provider: string | null = 'spotify', stored: any = null) {
    if (provider === null) delete process.env.MUSIC_METADATA_PROVIDER;
    else process.env.MUSIC_METADATA_PROVIDER = provider;
    const spotify: any = {
      name: 'spotify',
      searchAlbums: jest.fn().mockResolvedValue([]),
      searchArtists: jest.fn().mockResolvedValue([]),
      getAlbumDetails: jest.fn().mockResolvedValue({
        id: spotifyId,
        spotifyAlbumId: spotifyId,
        spotifyArtistId: spotifyId,
        source: 'spotify',
        coverUrl: 'https://i.scdn.co/image/album',
        sourceAlbumUrl: `https://open.spotify.com/album/${spotifyId}`,
      }),
      getAlbumTracks: jest.fn().mockResolvedValue({ tracks: [] }),
      getArtistDetails: jest.fn().mockResolvedValue({
        name: 'Artist',
        spotifyArtistId: spotifyId,
        imageUrl: 'https://i.scdn.co/image/artist',
        sourceArtistUrl: `https://open.spotify.com/artist/${spotifyId}`,
      }),
      getArtistAlbums: jest.fn().mockResolvedValue([]),
    };
    const musicbrainz: any = {
      ...Object.fromEntries(
        Object.keys(spotify)
          .filter((k) => k !== 'name')
          .map((k) => [k, jest.fn().mockResolvedValue([])]),
      ),
      name: 'musicbrainz',
    };
    const catalog: any = {
      findAlbum: jest.fn().mockResolvedValue(stored),
      findArtist: jest.fn().mockResolvedValue(null),
      decorateAlbum: MetadataCatalogService.prototype.decorateAlbum,
      decorateAlbums: jest.fn((x) => x),
      decorateArtists: jest.fn((x) => x),
    };
    const legacy: any = {
      getOtherAlbums: jest.fn(),
      getAlbumArtistImage: jest.fn(),
      getAlbumPersonnel: jest.fn(),
      getReleaseGroupIdForRelease: jest.fn().mockResolvedValue(mbid),
    };
    const reviews: any = {
      findOne: jest.fn().mockResolvedValue({
        releaseGroupMbId: mbid,
        albumTitleSnapshot: 'Old Album',
        artistNameSnapshot: 'Old Artist',
      }),
    };
    return {
      service: new MusicMetadataService(
        spotify,
        musicbrainz,
        catalog,
        legacy,
        reviews,
      ),
      spotify,
      musicbrainz,
      legacy,
    };
  }
  it('routes all metadata features to Spotify without using MusicBrainz', async () => {
    const { service, spotify, musicbrainz, legacy } = setup();
    await service.searchAlbums('album');
    await service.searchArtists('artist');
    await service.getAlbumDetails(spotifyId);
    await service.getAlbumTracks(spotifyId);
    await service.getOtherAlbums(spotifyId);
    expect(await service.getAlbumArtistImage(spotifyId)).toEqual(
      expect.objectContaining({
        imageUrl: 'https://i.scdn.co/image/artist',
        source: 'spotify',
        sourceArtistUrl: `https://open.spotify.com/artist/${spotifyId}`,
        attributionText: 'Metadata and artwork from Spotify',
      }),
    );
    await service.getArtistProfile(spotifyId);
    expect(await service.getCoverArt(spotifyId)).toEqual(
      expect.objectContaining({
        url: 'https://i.scdn.co/image/album',
        source: 'spotify',
        sourceAlbumUrl: `https://open.spotify.com/album/${spotifyId}`,
      }),
    );
    expect(await service.getAlbumPersonnel(spotifyId)).toEqual(
      expect.objectContaining({ personnel: [], source: 'spotify' }),
    );
    expect(spotify.searchArtists).toHaveBeenCalled();
    for (const fn of [...Object.values(musicbrainz), ...Object.values(legacy)])
      if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled();
  });
  it('defaults to Spotify when no provider is configured', () => {
    delete process.env.MUSIC_SEARCH_PROVIDER;
    expect(setup(null).service.provider.name).toBe('spotify');
  });
  it('retains the legacy provider setting for existing deployments', () => {
    process.env.MUSIC_SEARCH_PROVIDER = 'musicbrainz';
    expect(setup(null).service.provider.name).toBe('musicbrainz');
  });
  it('lets the explicit metadata provider override the legacy search provider', () => {
    process.env.MUSIC_SEARCH_PROVIDER = 'musicbrainz';
    expect(setup('spotify').service.provider.name).toBe('spotify');
  });
  it('resolves legacy references through reviewed mapping and preserves MB IDs', async () => {
    const { service, spotify } = setup('spotify', {
      id: 'local-id',
      musicbrainzReleaseGroupId: mbid,
      spotifyAlbumId: spotifyId,
    });
    expect(await service.getAlbumDetails(mbid)).toEqual(
      expect.objectContaining({
        id: mbid,
        spotifyAlbumId: spotifyId,
        musicbrainzReleaseGroupId: mbid,
        localAlbumId: 'local-id',
      }),
    );
    expect(spotify.getAlbumDetails).toHaveBeenCalledWith(spotifyId);
  });
  it('renders unmapped review snapshots without searching or calling the VM', async () => {
    const { service, spotify, musicbrainz } = setup();
    expect(await service.getAlbumDetails(mbid)).toEqual(
      expect.objectContaining({
        name: 'Old Album',
        source: 'snapshot',
        metadataUnavailable: true,
      }),
    );
    await expect(service.getAlbumTracks(mbid)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(spotify.searchAlbums).not.toHaveBeenCalled();
    expect(musicbrainz.getAlbumDetails).not.toHaveBeenCalled();
  });
  it('reactivates MusicBrainz with the retained ID', async () => {
    const { service, musicbrainz, spotify } = setup('musicbrainz', {
      id: 'local-id',
      musicbrainzReleaseGroupId: mbid,
      spotifyAlbumId: spotifyId,
    });
    await service.getAlbumTracks(spotifyId);
    expect(musicbrainz.getAlbumTracks).toHaveBeenCalledWith(mbid);
    expect(spotify.getAlbumTracks).not.toHaveBeenCalled();
  });
  it('resolves release-only rollback identities only through the selected MusicBrainz provider', async () => {
    const release = '22222222-2222-4222-8222-222222222222';
    const { service, legacy, musicbrainz } = setup('musicbrainz', {
      id: 'local-id',
      musicbrainzReleaseId: release,
      spotifyAlbumId: spotifyId,
    });
    await service.getAlbumTracks(spotifyId);
    expect(legacy.getReleaseGroupIdForRelease).toHaveBeenCalledWith(release);
    expect(musicbrainz.getAlbumTracks).toHaveBeenCalledWith(mbid);
  });
  it('rejects misspelled provider configuration', () => {
    expect(() => setup('spotfy')).toThrow('MUSIC_METADATA_PROVIDER');
  });
});
