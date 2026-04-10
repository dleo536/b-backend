import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ArrayContains, ILike, In, Not, Repository } from "typeorm";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";
import { AlbumList, ListVisibility } from "./list.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";
import { ListLike } from "./list-like.entity";
import { AuthUserContextService } from "../auth/auth-user-context.service";
import { ModerationService } from "../moderation/moderation.service";

@Injectable()
export class ListService {
    constructor(
        @InjectRepository(AlbumList)
        private listRepository: Repository<AlbumList>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserFollow)
        private followRepository: Repository<UserFollow>,
        @InjectRepository(ListLike)
        private listLikeRepository: Repository<ListLike>,
        private readonly authUserContextService: AuthUserContextService,
        private readonly moderationService: ModerationService,
    ) {}

    private isUuid(value: string): boolean {
        if (typeof value !== "string") {
            return false;
        }
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    private async findUserByIdentifier(identifier?: string): Promise<User | null> {
        if (!identifier) {
            return null;
        }

        if (this.isUuid(identifier)) {
            return this.userRepository.findOne({ where: { id: identifier } });
        }

        return this.userRepository.findOne({ where: { oauthId: identifier } });
    }

    private async requireUserByIdentifier(identifier: string, label: string): Promise<User> {
        if (!identifier) {
            throw new BadRequestException(`${label} identifier is required`);
        }

        const user = await this.findUserByIdentifier(identifier);
        if (!user) {
            throw new NotFoundException(`${label} not found`);
        }

        return user;
    }

    private resolveSystemListFlag(createListDto: CreateListDto): boolean {
        const normalizedSlug = (createListDto.slug ?? "").toLowerCase();
        const normalizedTitle = (createListDto.title ?? "").toLowerCase();

        return (
            normalizedSlug === "backlog" ||
            normalizedSlug === "favorites" ||
            normalizedTitle === "backlog" ||
            normalizedTitle === "favorites"
        );
    }

    private normalizeAlbumIds(albumIds?: string[]): string[] | undefined {
        if (albumIds === undefined) {
            return undefined;
        }

        return Array.from(
            new Set(
                albumIds
                    .filter((id): id is string => typeof id === "string")
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0),
            ),
        );
    }

    private normalizeListVisibility(visibility?: string) {
        if (visibility === undefined || visibility === null || visibility === "") {
            return ListVisibility.PUBLIC;
        }

        return visibility === ListVisibility.PUBLIC
            ? ListVisibility.PUBLIC
            : ListVisibility.PRIVATE;
    }

    private isListPublic(list: AlbumList): boolean {
        return this.normalizeListVisibility(list.visibility) === "public";
    }

    private canViewList(list: AlbumList, viewerUserId?: string | null): boolean {
        return this.isListPublic(list) || (Boolean(viewerUserId) && list.ownerId === viewerUserId);
    }

    private toWhereConditions(where: any): Record<string, unknown>[] {
        if (Array.isArray(where)) {
            return where.length > 0 ? where : [{}];
        }

        return [where ?? {}];
    }

    private dedupeWhereConditions(conditions: Record<string, unknown>[]) {
        const serialized = new Set<string>();
        return conditions.filter((condition) => {
            const key = JSON.stringify(condition);
            if (serialized.has(key)) {
                return false;
            }
            serialized.add(key);
            return true;
        });
    }

    private buildReadableListWhere(baseWhere: any, ownerAccessUserId?: string | null) {
        const baseConditions = this.toWhereConditions(baseWhere);
        const publicConditions = baseConditions.map((condition) => ({
            ...condition,
            visibility: ListVisibility.PUBLIC,
        }));

        if (!ownerAccessUserId) {
            return publicConditions.length === 1 ? publicConditions[0] : publicConditions;
        }

        const ownerConditions = baseConditions.map((condition) => {
            const nextCondition: Record<string, unknown> = {
                ...condition,
                ownerId: ownerAccessUserId,
            };
            delete nextCondition.firebaseUid;
            delete nextCondition.visibility;
            return nextCondition;
        });

        const conditions = this.dedupeWhereConditions([
            ...publicConditions,
            ...ownerConditions,
        ]);

        return conditions.length === 1 ? conditions[0] : conditions;
    }

    private async getListOrThrowById(id: string): Promise<AlbumList> {
        const list = await this.listRepository.findOne({
            where: { id },
        });

        if (!list) {
            throw new NotFoundException('List not found');
        }

        return list;
    }

    private appendTitleFilter(where: any, title?: string) {
        const normalizedTitle = title?.trim();

        if (!normalizedTitle) {
            return where;
        }

        const titleFilter = ILike(`%${normalizedTitle}%`);

        if (Array.isArray(where)) {
            return where.map((condition) => ({
                ...condition,
                title: titleFilter,
            }));
        }

        return {
            ...where,
            title: titleFilter,
        };
    }

    private appendAlbumFilter(where: any, albumId?: string) {
        const normalizedAlbumId = albumId?.trim();

        if (!normalizedAlbumId) {
            return where;
        }

        const albumFilter = ArrayContains([normalizedAlbumId]);

        if (Array.isArray(where)) {
            return where.map((condition) => ({
                ...condition,
                albumIds: albumFilter,
            }));
        }

        return {
            ...where,
            albumIds: albumFilter,
        };
    }

    private appendExcludedOwnerIds(where: any, excludedOwnerIds: string[]) {
        if (!excludedOwnerIds.length) {
            return where;
        }

        const nextConditions = this.toWhereConditions(where)
            .map((condition) => {
                const nextCondition = condition ?? {};

                if (typeof nextCondition.ownerId === "string") {
                    return excludedOwnerIds.includes(nextCondition.ownerId)
                        ? null
                        : nextCondition;
                }

                if (nextCondition.ownerId !== undefined) {
                    return nextCondition;
                }

                return {
                    ...nextCondition,
                    ownerId: Not(In(excludedOwnerIds)),
                };
            })
            .filter((condition): condition is Record<string, unknown> => Boolean(condition));

        if (nextConditions.length === 0) {
            return { ownerId: In([]) };
        }

        return nextConditions.length === 1 ? nextConditions[0] : nextConditions;
    }

    async create(createListDto: CreateListDto, currentUserOauthId: string) {
        const user = await this.requireUserByIdentifier(currentUserOauthId, "Authenticated user");

        this.moderationService.assertTextFieldsAreAllowed([
            { label: "list title", value: createListDto.title },
            { label: "list description", value: createListDto.description },
        ]);

        const albumIds =
            this.normalizeAlbumIds(createListDto.albumIds ?? createListDto.albumList) ?? [];

        const list = this.listRepository.create({
            title: createListDto.title,
            slug: createListDto.slug,
            description: createListDto.description,
            visibility: createListDto.visibility,
            listType: createListDto.listType,
            isSystem: this.resolveSystemListFlag(createListDto),
            ownerId: user.id,
            firebaseUid: currentUserOauthId,
            albumIds,
            itemsCount: albumIds.length,
        });
        const result = await this.listRepository.save(list);
        return result;
    }

    async findAll(
        userID?: string,
        offset: number = 0,
        limit: number = 10,
        viewerUid?: string,
        title?: string,
        albumId?: string,
    ) {
        const normalizedViewerUid = viewerUid?.trim() || undefined;
        const viewerUser = await this.findUserByIdentifier(normalizedViewerUid);
        const viewerUserId = viewerUser?.id ?? null;
        const excludedOwnerIds = viewerUserId
            ? await this.moderationService.getVisibilityExcludedUserIds(viewerUserId)
            : [];
        let where: any = {};
        let linkedUserId: string | null = null;
        let followFilterMode: "global" | "following" | "global-fallback" | "user" = "global";
        if (userID) {
            followFilterMode = "user";
            if (this.isUuid(userID)) {
                where = [{ ownerId: userID }, { firebaseUid: userID }];
                linkedUserId = userID;
            } else {
                const linkedUser = await this.findUserByIdentifier(userID);
                linkedUserId = linkedUser?.id ?? null;
                where = linkedUser
                    ? [{ ownerId: linkedUser.id }, { firebaseUid: userID }]
                    : { firebaseUid: userID };
            }

            if (linkedUserId && excludedOwnerIds.includes(linkedUserId) && linkedUserId !== viewerUserId) {
                return {
                    data: [],
                    hasMore: false,
                    totalCount: 0,
                    mode: followFilterMode,
                };
            }

            const ownerAccessUserId =
                viewerUserId && linkedUserId && viewerUserId === linkedUserId
                    ? viewerUserId
                    : null;
            where = this.buildReadableListWhere(where, ownerAccessUserId);
        } else if (viewerUid) {
            linkedUserId = viewerUserId;

            if (viewerUser) {
                const follows = await this.followRepository.find({
                    where: { followerId: viewerUser.id },
                });
                const followedIds = follows
                    .map((follow) => follow.followingId)
                    .filter((followedId) => !excludedOwnerIds.includes(followedId));
                const filteredOwnerIds = Array.from(new Set([...followedIds, viewerUser.id]));

                if (followedIds.length > 0) {
                    let followedOnlyWhere = this.buildReadableListWhere(
                        { ownerId: In(followedIds), isSystem: false },
                        null,
                    );
                    followedOnlyWhere = this.appendTitleFilter(followedOnlyWhere, title);
                    followedOnlyWhere = this.appendAlbumFilter(followedOnlyWhere, albumId);
                    const followedOnlyCount = await this.listRepository.count({ where: followedOnlyWhere });

                    if (followedOnlyCount > 0) {
                        let filteredWhere = this.buildReadableListWhere(
                            { ownerId: In(filteredOwnerIds), isSystem: false },
                            viewerUser.id,
                        );
                        filteredWhere = this.appendTitleFilter(filteredWhere, title);
                        filteredWhere = this.appendAlbumFilter(filteredWhere, albumId);
                        const filteredTotalCount = await this.listRepository.count({ where: filteredWhere });
                        const lists = await this.listRepository.find({
                            where: filteredWhere,
                            skip: offset,
                            take: limit,
                            order: {
                                createdAt: 'DESC',
                            },
                        });
                        const hasMore = offset + lists.length < filteredTotalCount;

                        return {
                            data: lists,
                            hasMore,
                            totalCount: filteredTotalCount,
                            mode: "following",
                        };
                    }

                    followFilterMode = "global-fallback";
                    where = this.buildReadableListWhere({ isSystem: false }, viewerUser.id);
                } else {
                    where = this.buildReadableListWhere({ isSystem: false }, viewerUser.id);
                }
            } else {
                where = this.buildReadableListWhere({ isSystem: false }, null);
            }
        } else {
            where = this.buildReadableListWhere({ isSystem: false }, null);
        }

        where = this.appendTitleFilter(where, title);
        where = this.appendAlbumFilter(where, albumId);
        where = this.appendExcludedOwnerIds(where, excludedOwnerIds);

        // Get the total count of matching documents
        const totalCount = await this.listRepository.count({ where });

        // Get paginated lists
        const lists = await this.listRepository.find({
            where,
            skip: offset,
            take: limit,
            order: {
                createdAt: 'DESC',
            },
        });

        const hasMore = offset + lists.length < totalCount;

        return {
            data: lists,
            hasMore,
            totalCount,
            mode: followFilterMode,
        };
    }

    async findByUserId(userID: string, viewerIdentifier?: string) {
        const viewer = await this.findUserByIdentifier(viewerIdentifier);
        const viewerUserId = viewer?.id ?? null;
        const excludedOwnerIds = viewerUserId
            ? await this.moderationService.getVisibilityExcludedUserIds(viewerUserId)
            : [];
        let linkedUserId: string | null = null;
        let where: any;
        if (this.isUuid(userID)) {
            where = [{ ownerId: userID }, { firebaseUid: userID }];
            linkedUserId = userID;
        } else {
            const linkedUser = await this.findUserByIdentifier(userID);
            linkedUserId = linkedUser?.id ?? null;
            where = linkedUser
                ? [{ ownerId: linkedUser.id }, { firebaseUid: userID }]
                : { firebaseUid: userID };
        }

        if (linkedUserId && excludedOwnerIds.includes(linkedUserId) && linkedUserId !== viewerUserId) {
            return [];
        }

        const ownerAccessUserId =
            viewerUserId && linkedUserId && viewerUserId === linkedUserId
                ? viewerUserId
                : null;
        const readableWhere = this.appendExcludedOwnerIds(
            this.buildReadableListWhere(where, ownerAccessUserId),
            excludedOwnerIds,
        );

        const lists = await this.listRepository.find({
            where: readableWhere,
            order: {
                createdAt: 'DESC',
            },
        });

        return lists;
    }

    async findOne(id: string, viewerIdentifier?: string) {
        const list = await this.getListOrThrowById(id);
        const viewer = await this.findUserByIdentifier(viewerIdentifier);
        const viewerUserId = viewer?.id ?? null;

        if (!this.canViewList(list, viewerUserId)) {
            throw new NotFoundException('List not found');
        }

        if (viewerUserId && await this.moderationService.isBlockedBetweenUsersByIds(viewerUserId, list.ownerId)) {
            throw new NotFoundException("List not found");
        }

        return list;
    }

    async likeList(listId: string, viewerIdentifier: string) {
        const viewer = await this.requireUserByIdentifier(viewerIdentifier, "Viewer");
        const list = await this.findOne(listId, viewerIdentifier);

        const existingLike = await this.listLikeRepository.findOne({
            where: {
                userId: viewer.id,
                listId: list.id,
            },
        });

        if (existingLike) {
            return {
                success: true,
                liked: true,
                listId: list.id,
                userId: viewer.id,
                likesCount: list.likesCount ?? 0,
            };
        }

        const like = this.listLikeRepository.create({
            userId: viewer.id,
            listId: list.id,
        });
        await this.listLikeRepository.save(like);

        list.likesCount = (list.likesCount ?? 0) + 1;
        await this.listRepository.save(list);

        return {
            success: true,
            liked: true,
            listId: list.id,
            userId: viewer.id,
            likesCount: list.likesCount,
        };
    }

    async unlikeList(listId: string, viewerIdentifier: string) {
        const viewer = await this.requireUserByIdentifier(viewerIdentifier, "Viewer");
        const list = await this.findOne(listId, viewerIdentifier);

        const existingLike = await this.listLikeRepository.findOne({
            where: {
                userId: viewer.id,
                listId: list.id,
            },
        });

        if (existingLike) {
            await this.listLikeRepository.remove(existingLike);
            list.likesCount = Math.max(0, (list.likesCount ?? 0) - 1);
            await this.listRepository.save(list);
        }

        return {
            success: true,
            liked: false,
            listId: list.id,
            userId: viewer.id,
            likesCount: list.likesCount ?? 0,
        };
    }

    async isListLiked(listId: string, viewerIdentifier: string) {
        const viewer = await this.requireUserByIdentifier(viewerIdentifier, "Viewer");
        const list = await this.findOne(listId, viewerIdentifier);

        const existingLike = await this.listLikeRepository.findOne({
            where: {
                userId: viewer.id,
                listId: list.id,
            },
        });

        return {
            liked: Boolean(existingLike),
            listId: list.id,
            userId: viewer.id,
            likesCount: list.likesCount ?? 0,
        };
    }

    async getLikedLists(viewerIdentifier: string, offset: number = 0, limit: number = 50) {
        const viewer = await this.requireUserByIdentifier(viewerIdentifier, "Viewer");
        const likes = await this.listLikeRepository.find({
            where: { userId: viewer.id },
            relations: ["list"],
            order: { createdAt: "DESC" },
        });

        const likedLists = likes
            .map((like) => like.list)
            .filter((list): list is AlbumList => Boolean(list))
            .filter((list) => this.canViewList(list, viewer.id));

        const totalCount = likedLists.length;
        const paginatedLists = likedLists.slice(offset, offset + limit);

        return {
            data: paginatedLists,
            hasMore: offset + paginatedLists.length < totalCount,
            totalCount,
        };
    }

    async update(id: string, updateListDto: UpdateListDto, currentUserOauthId: string) {
        const list = await this.requireListOwner(id, currentUserOauthId);
        const normalizedAlbumIds = this.normalizeAlbumIds(
            updateListDto.albumIds ?? updateListDto.albumList,
        );

        this.moderationService.assertTextFieldsAreAllowed([
            { label: "list title", value: updateListDto.title },
            { label: "list description", value: updateListDto.description },
        ]);

        if (updateListDto.title !== undefined) {
            list.title = updateListDto.title;
        }
        if (updateListDto.slug !== undefined) {
            list.slug = updateListDto.slug;
        }
        if (updateListDto.description !== undefined) {
            list.description = updateListDto.description;
        }
        if (updateListDto.visibility !== undefined) {
            list.visibility = updateListDto.visibility;
        }
        if (updateListDto.listType !== undefined) {
            list.listType = updateListDto.listType;
        }
        if (normalizedAlbumIds !== undefined) {
            list.albumIds = normalizedAlbumIds;
            list.itemsCount = normalizedAlbumIds.length;
        }

        const result = await this.listRepository.save(list);
        return result;
    }

    async remove(id: string, currentUserOauthId: string) {
        const list = await this.requireListOwner(id, currentUserOauthId);
        const result = await this.listRepository.remove(list);
        return result;
    }

    async removeAsAdmin(id: string, currentUserOauthId: string) {
        await this.authUserContextService.requireAdminByOauthId(currentUserOauthId);
        const list = await this.getListOrThrowById(id);
        return this.listRepository.softRemove(list);
    }

    private async requireListOwner(listId: string, currentUserOauthId: string): Promise<AlbumList> {
        const currentUser = await this.requireUserByIdentifier(currentUserOauthId, "Authenticated user");
        const list = await this.getListOrThrowById(listId);

        if (list.ownerId !== currentUser.id) {
            // TODO(authz): allow admin/mod list management and collaborative editor permissions.
            throw new ForbiddenException("You can only modify your own lists");
        }

        return list;
    }
}
