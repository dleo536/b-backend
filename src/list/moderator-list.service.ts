import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth-user.interface';
import { assertListRepairModerator } from '../auth/list-repair-moderator';
import type { EditModeratorAlbumsDto } from './dto/moderator-albums.dto';

@Injectable()
export class ModeratorListService {
  constructor(private readonly database: DataSource) {}

  private async readList(manager: EntityManager, listId: string) {
    const [list] = await manager.query(
      'SELECT "id", "albumIds" FROM "album_lists" WHERE "id"=$1 AND "deletedAt" IS NULL FOR UPDATE',
      [listId],
    );
    if (!list) throw new NotFoundException('List not found');
    return list;
  }

  private async save(
    manager: EntityManager,
    user: AuthenticatedUser,
    listId: string,
    action: string,
    before: string[],
    after: string[],
  ) {
    await manager.query(
      'INSERT INTO "list_moderator_actions" ("actorUserId", "actorFirebaseUid", "listId", "action", "beforeAlbumIds", "afterAlbumIds") VALUES ($1,$2,$3,$4,$5,$6)',
      [user.appUserId, user.uid, listId, action, before, after],
    );
    const [updated] = await manager.query(
      'UPDATE "album_lists" SET "albumIds"=$2, "itemsCount"=$3, "updatedAt"=clock_timestamp() WHERE "id"=$1 RETURNING "id", "albumIds", "itemsCount", "updatedAt"',
      [listId, after, after.length],
    );
    return updated;
  }

  async addAlbum(user: AuthenticatedUser, listId: string, albumId: string) {
    assertListRepairModerator(user);
    return this.database.transaction(async (manager) => {
      const list = await this.readList(manager, listId);
      if (list.albumIds.includes(albumId)) return { ...list, added: false };
      const updated = await this.save(
        manager,
        user,
        listId,
        'add_album',
        list.albumIds,
        [...list.albumIds, albumId],
      );
      return { ...updated, added: true };
    });
  }

  async editAlbums(
    user: AuthenticatedUser,
    listId: string,
    input: EditModeratorAlbumsDto,
  ) {
    assertListRepairModerator(user);
    return this.database.transaction(async (manager) => {
      const list = await this.readList(manager, listId);
      if (
        JSON.stringify(list.albumIds) !== JSON.stringify(input.expectedAlbumIds)
      ) {
        throw new ConflictException(
          'This list changed. Close the editor, refresh the list, and try again.',
        );
      }
      // Edit List may remove/reorder existing entries, including legacy IDs.
      // Only the explicit add endpoint can insert a new album.
      const remaining = new Map<string, number>();
      for (const id of list.albumIds)
        remaining.set(id, (remaining.get(id) || 0) + 1);
      for (const id of input.albumIds) {
        const count = remaining.get(id) || 0;
        if (!count)
          throw new BadRequestException(
            'Edit List can only remove or reorder existing albums',
          );
        remaining.set(id, count - 1);
      }
      if (JSON.stringify(list.albumIds) === JSON.stringify(input.albumIds))
        return list;
      return this.save(
        manager,
        user,
        listId,
        'edit_albums',
        list.albumIds,
        input.albumIds,
      );
    });
  }
}
