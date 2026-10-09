import { MetadataCatalogService } from './metadata-catalog.service';
const mbid = '11111111-1111-4111-8111-111111111111';
const spotifyId = '1234567890123456789012';
describe('review provider identity', () => {
  const input = { albumTitleSnapshot: 'Album', artistNameSnapshot: 'Artist' };
  it('never accepts an unreviewed MB/Spotify pairing from the client', async () => {
    const albums: any = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const service = new MetadataCatalogService(albums, {} as any);
    await expect(
      service.ensureReviewIdentity({
        ...input,
        releaseGroupMbId: mbid,
        spotifyAlbumId: spotifyId,
      }),
    ).rejects.toThrow('reviewed mapping');
    expect(albums.save).not.toHaveBeenCalled();
  });
  it('returns a mapped canonical record for Spotify-only input', async () => {
    const record = {
      id: 'local',
      musicbrainzReleaseGroupId: mbid,
      spotifyAlbumId: spotifyId,
    };
    const service = new MetadataCatalogService(
      { findOne: jest.fn().mockResolvedValue(record) } as any,
      {} as any,
    );
    expect(
      await service.ensureReviewIdentity({
        ...input,
        spotifyAlbumId: spotifyId,
      }),
    ).toBe(record);
  });
  it('creates Spotify-only records without fabricating MB IDs', async () => {
    const albums: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn((x) => x),
    };
    const service = new MetadataCatalogService(albums, {} as any);
    expect(
      await service.ensureReviewIdentity({
        ...input,
        spotifyAlbumId: spotifyId,
      }),
    ).toEqual(
      expect.objectContaining({
        spotifyAlbumId: spotifyId,
        musicbrainzReleaseGroupId: null,
      }),
    );
  });
  it('rejects a Spotify ID in a MusicBrainz field', async () => {
    const service = new MetadataCatalogService({} as any, {} as any);
    await expect(
      service.ensureReviewIdentity({ ...input, releaseGroupMbId: spotifyId }),
    ).rejects.toThrow('UUID');
  });
});
