import { RecentReleaseAlbum } from './recent-release-album.entity';

const getArtistSubtitle = (album: any) =>
  Array.isArray(album?.artists) && album.artists.length > 0
    ? album.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
    : 'Unknown Artist';

export const toRecentReleaseAlbumResponse = (entry: RecentReleaseAlbum) => {
  const album = entry.albumSnapshot as any;

  return {
    id: album?.id || entry.spotifyAlbumId,
    recentReleaseId: entry.id,
    spotifyAlbumId: entry.spotifyAlbumId,
    sortOrder: entry.sortOrder,
    title: album?.name || 'Untitled Album',
    artistSubtitle: getArtistSubtitle(album),
    coverUrl: album?.images?.[0]?.url || null,
    releaseDate: album?.release_date || null,
    spotifyAlbum: album,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
};

export const toRecentReleaseAlbumResponses = (entries: RecentReleaseAlbum[]) =>
  entries.map(toRecentReleaseAlbumResponse);
