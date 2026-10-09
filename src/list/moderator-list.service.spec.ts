import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { ModeratorListService } from './moderator-list.service';
import { AddModeratorAlbumDto } from './dto/moderator-albums.dto';

describe('moderator list management authorization', () => {
  it.each([
    {
      email: 'other@example.com',
      email_verified: true,
      roles: ['mod', 'admin'],
    },
    { email: 'dannyapolisttest@gmail.com', email_verified: true },
    { email: 'dannyapolistest@gmail.com', email_verified: false },
  ])('rejects %j before reading or writing the database', async (token) => {
    const database = { transaction: jest.fn() };
    const service = new ModeratorListService(database as any);
    const user: any = { uid: 'uid', appUserId: 'profile', ...token };
    await expect(service.addAlbum(user, 'list', 'album')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.editAlbums(user, 'list', { albumIds: [], expectedAlbumIds: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it.each(['1234567890123456789012', '11111111-1111-4111-8111-111111111111'])(
    'accepts a Spotify or preserved UUID identity: %s',
    async (albumId) => {
      expect(
        await validate(Object.assign(new AddModeratorAlbumDto(), { albumId })),
      ).toHaveLength(0);
    },
  );
  it.each(['', 'https://open.spotify.com/album/123', 'not-an-album'])(
    'rejects invalid additions: %s',
    async (albumId) => {
      expect(
        (await validate(Object.assign(new AddModeratorAlbumDto(), { albumId })))
          .length,
      ).toBeGreaterThan(0);
    },
  );
});
