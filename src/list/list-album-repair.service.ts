import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, ILike } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth-user.interface';
import { assertListRepairModerator } from '../auth/list-repair-moderator';
import { SpotifyService } from '../spotify/spotify.service';
import { normalizeSpotifyAlbum } from '../metadata/spotify.provider';
import { AlbumList } from './list.entity';
import { toListResponse } from './list-response';
import type {
  ApplyAlbumRepairDto,
  PreviewAlbumRepairDto,
} from './dto/repair-album.dto';

@Injectable()
export class ListAlbumRepairService {
  constructor(
    private readonly database: DataSource,
    private readonly spotify: SpotifyService,
  ) {}

  async findLists(user: AuthenticatedUser, query = '', offset = 0) {
    assertListRepairModerator(user);
    const [lists, totalCount] = await this.database
      .getRepository(AlbumList)
      .findAndCount({
        where: query.trim()
          ? [
              { title: ILike(`%${query.trim()}%`) },
              { owner: { username: ILike(`%${query.trim()}%`) } },
            ]
          : {},
        relations: ['owner'],
        order: { createdAt: 'DESC' },
        take: 20,
        skip: offset,
      });
    return {
      data: lists.map((list) => ({
        ...toListResponse(list),
        ownerUsername: list.owner?.username || null,
      })),
      totalCount,
      hasMore: offset + lists.length < totalCount,
    };
  }

  async getList(user: AuthenticatedUser, listId: string) {
    assertListRepairModerator(user);
    const list = await this.database
      .getRepository(AlbumList)
      .findOne({ where: { id: listId } });
    if (!list) throw new NotFoundException('List not found');
    return toListResponse(list);
  }

  private async readList(manager: EntityManager, listId: string, lock = false) {
    const [list] = await manager.query(
      `SELECT "id", "albumIds", "updatedAt" FROM "album_lists" WHERE "id"=$1 AND "deletedAt" IS NULL${lock ? ' FOR UPDATE' : ''}`,
      [listId],
    );
    if (!list) throw new NotFoundException('List not found');
    return list;
  }

  private async plan(
    manager: EntityManager,
    listId: string,
    input: PreviewAlbumRepairDto,
  ) {
    if (input.reason.trim().length < 5)
      throw new BadRequestException(
        'A repair reason of at least five characters is required',
      );
    const list = await this.readList(manager, listId);
    const index = list.albumIds.indexOf(input.albumId);
    if (index < 0)
      throw new ConflictException('This album is no longer in the list');
    if (list.albumIds.filter((id: string) => id === input.albumId).length !== 1)
      throw new ConflictException(
        'This list contains duplicate legacy IDs. Resolve their positions before repairing.',
      );
    if (list.albumIds.includes(input.spotifyAlbumId))
      throw new ConflictException(
        'The selected Spotify album is already in this list',
      );
    // An untyped legacy UUID stays untyped: no global provider mapping is made.
    const [stored] = await manager.query(
      `SELECT "title", "artistName" FROM "metadata_albums" WHERE "id"=$1 OR "musicbrainzReleaseGroupId"=$2 OR "musicbrainzReleaseId"=$3`,
      [input.albumId, input.albumId, input.albumId],
    );
    const [review] = await manager.query(
      `SELECT "albumTitleSnapshot", "artistNameSnapshot" FROM "reviews" WHERE "releaseGroupMbId"=$1 OR "releaseMbId"=$2 OR "albumId"=$3 ORDER BY "createdAt" ASC LIMIT 1`,
      [input.albumId, input.albumId, input.albumId],
    );
    const album: any = await this.spotify.getAlbum(input.spotifyAlbumId);
    if (
      album?.id !== input.spotifyAlbumId ||
      !album?.name ||
      !album.artists?.length
    )
      throw new BadRequestException('Spotify returned an invalid album');
    const replacement = normalizeSpotifyAlbum(album);
    const nextAlbumIds = [...list.albumIds];
    nextAlbumIds[index] = input.spotifyAlbumId;
    const previewFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          listId,
          albumId: input.albumId,
          before: list.albumIds,
          updatedAt: list.updatedAt,
          replacement,
          reason: input.reason.trim(),
        }),
      )
      .digest('hex');
    return {
      list,
      nextAlbumIds,
      preview: {
        mode: 'dry-run' as const,
        listId,
        originalAlbumId: input.albumId,
        position: index + 1,
        currentTitle: stored?.title || review?.albumTitleSnapshot || null,
        currentArtistName:
          stored?.artistName || review?.artistNameSnapshot || null,
        replacement,
        reason: input.reason.trim(),
        previewFingerprint,
        affectedListCount: 1,
      },
    };
  }

  private readOnlyPlan(listId: string, input: PreviewAlbumRepairDto) {
    return this.database.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      return this.plan(manager, listId, input);
    });
  }

  async preview(
    user: AuthenticatedUser,
    listId: string,
    input: PreviewAlbumRepairDto,
  ) {
    assertListRepairModerator(user);
    return (await this.readOnlyPlan(listId, input)).preview;
  }

  async apply(
    user: AuthenticatedUser,
    listId: string,
    input: ApplyAlbumRepairDto,
  ) {
    assertListRepairModerator(user);
    const plan = await this.readOnlyPlan(listId, input);
    if (plan.preview.previewFingerprint !== input.previewFingerprint)
      throw new ConflictException(
        'The preview is stale. Preview this repair again before applying.',
      );
    return this.database.transaction(async (manager) => {
      const list = await this.readList(manager, listId, true);
      if (
        JSON.stringify(list.albumIds) !== JSON.stringify(plan.list.albumIds) ||
        new Date(list.updatedAt).getTime() !==
          new Date(plan.list.updatedAt).getTime()
      )
        throw new ConflictException('The list changed. Preview again.');
      // Archive original references and change just one list, atomically.
      // Catalog identities, review rows, and all other lists remain untouched.
      const [audit] = await manager.query(
        `INSERT INTO "list_album_repairs" ("actorUserId","actorFirebaseUid","listId","originalAlbumId","spotifyAlbumId","reason","previewFingerprint","beforeJson","afterJson") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING "id"`,
        [
          user.appUserId,
          user.uid,
          listId,
          input.albumId,
          input.spotifyAlbumId,
          input.reason.trim(),
          input.previewFingerprint,
          JSON.stringify({
            albumIds: list.albumIds,
            updatedAt: list.updatedAt,
          }),
          JSON.stringify({
            albumIds: plan.nextAlbumIds,
            preview: plan.preview,
          }),
        ],
      );
      await manager.query(
        `UPDATE "album_lists" SET "albumIds"=$2::varchar[], "itemsCount"=$3, "updatedAt"=now() WHERE "id"=$1`,
        [listId, plan.nextAlbumIds, plan.nextAlbumIds.length],
      );
      return {
        applied: true,
        auditId: audit.id,
        originalAlbumId: input.albumId,
        spotifyAlbumId: input.spotifyAlbumId,
        affectedListCount: 1,
      };
    });
  }

  async history(user: AuthenticatedUser, listId: string) {
    assertListRepairModerator(user);
    await this.getList(user, listId);
    return this.database.query(
      `SELECT "id", "originalAlbumId", "spotifyAlbumId", "reason", "createdAt", "undoneAt" FROM "list_album_repairs" WHERE "listId"=$1 ORDER BY "createdAt" DESC LIMIT 50`,
      [listId],
    );
  }

  async undo(user: AuthenticatedUser, listId: string, auditId: string) {
    assertListRepairModerator(user);
    return this.database.transaction(async (manager) => {
      const list = await this.readList(manager, listId, true);
      const [audit] = await manager.query(
        `SELECT * FROM "list_album_repairs" WHERE "id"=$1 AND "listId"=$2 FOR UPDATE`,
        [auditId, listId],
      );
      if (!audit) throw new NotFoundException('Repair not found');
      if (audit.undoneAt)
        throw new ConflictException('This repair has already been undone');
      if (
        JSON.stringify(list.albumIds) !==
        JSON.stringify(audit.afterJson.albumIds)
      )
        throw new ConflictException(
          'The list has changed since this repair. Undo later repairs first; no changes were made.',
        );
      const originalIds = audit.beforeJson.albumIds;
      await manager.query(
        `UPDATE "album_lists" SET "albumIds"=$2::varchar[], "itemsCount"=$3, "updatedAt"=now() WHERE "id"=$1`,
        [listId, originalIds, originalIds.length],
      );
      await manager.query(
        `UPDATE "list_album_repairs" SET "undoneAt"=now(), "undoneByUserId"=$2 WHERE "id"=$1`,
        [auditId, user.appUserId],
      );
      return { undone: true, auditId };
    });
  }
}
