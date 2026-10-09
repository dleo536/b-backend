// Used only by the disposable PostgreSQL integration test; never by the app.
if (process.env.DB_NAME !== 'bsides_metadata_test' || process.env.DB_PORT !== '55439') throw new Error('Spotify test stub requires the disposable fixture database');
const artist = { id: 'abcdefghijklmnopqrstuv', name: 'Ice Cube', images: [{ url: 'https://i.scdn.co/image/test-artist' }] };
const album = { id: '1234567890123456789012', name: 'The Predator', artists: [artist], release_date: '1992-11-17', album_type: 'album', images: [{ url: 'https://i.scdn.co/image/test-album' }] };
global.fetch = async url => {
 const parsed = new URL(url);
 if (parsed.href === 'https://accounts.spotify.com/api/token') return new Response(JSON.stringify({ access_token: 'fixture-token', expires_in: 3600 }), { status: 200 });
 if (parsed.hostname !== 'api.spotify.com') throw new Error('Unexpected test request');
 if (parsed.pathname === '/v1/search') return new Response(JSON.stringify({ albums: { items: [album] } }), { status: 200 });
 if (parsed.pathname === '/v1/albums/' + album.id) return new Response(JSON.stringify(album), { status: 200 });
 if (parsed.pathname === '/v1/artists/' + artist.id) return new Response(JSON.stringify(artist), { status: 200 });
 throw new Error('Unexpected test endpoint');
};

