import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ArrayContains, ILike, In, Repository } from "typeorm";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";
import { AlbumList } from "./list.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";
import { ListLike } from "./list-like.entity";

@Injectable()
export class ListService {
    private readonly logger = new Logger(ListService.name);

    constructor(
        @InjectRepository(AlbumList)
        private listRepository: Repository<AlbumList>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserFollow)
        private followRepository: Repository<UserFollow>,
        @InjectRepository(ListLike)
        private listLikeRepository: Repository<ListLike>,
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
        if (typeof createListDto.isSystem === "boolean") {
            return createListDto.isSystem;
        }

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

    async create(createListDto: CreateListDto, currentUserOauthId: string) {
        const user = await this.requireUserByIdentifier(currentUserOauthId, "Authenticated user");

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
        // TODO(authz): enforce list visibility rules on read paths beyond the current public feed behavior.
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
        } else if (viewerUid) {
            const viewerUser = await this.findUserByIdentifier(viewerUid);
            linkedUserId = viewerUser?.id ?? null;

            if (viewerUser) {
                const follows = await this.followRepository.find({
                    where: { followerId: viewerUser.id },
                });
                const followedIds = follows.map((follow) => follow.followingId);
                const filteredOwnerIds = Array.from(new Set([...followedIds, viewerUser.id]));

                if (followedIds.length > 0) {
                    let followedOnlyWhere = this.appendTitleFilter(
                        { ownerId: In(followedIds), isSystem: false },
                        title,
                    );
                    followedOnlyWhere = this.appendAlbumFilter(followedOnlyWhere, albumId);
                    const followedOnlyCount = await this.listRepository.count({ where: followedOnlyWhere });

                    if (followedOnlyCount > 0) {
                        let filteredWhere = this.appendTitleFilter(
                            { ownerId: In(filteredOwnerIds), isSystem: false },
                            title,
                        );
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
                    where = { isSystem: false };
                } else {
                    where = { isSystem: false };
                }
            } else {
                this.logger.warn("[findAll] viewer token could not be resolved to a user profile");
                where = { isSystem: false };
            }
        } else {
            where = { isSystem: false };
        }

        where = this.appendTitleFilter(where, title);
        where = this.appendAlbumFilter(where, albumId);

        this.logger.log(
            `[findAll] userID=${userID ?? "none"} linkedUserId=${linkedUserId ?? "none"} mode=${followFilterMode} title=${title ?? "none"} albumId=${albumId ?? "none"} offset=${offset} limit=${limit} where=${JSON.stringify(where)}`,
        );

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

        this.logger.log(
            `[findAll] resultCount=${lists.length} totalCount=${totalCount} hasMore=${hasMore}`,
        );

        return {
            data: lists,
            hasMore,
            totalCount,
            mode: followFilterMode,
        };
    }

    async findByUserId(userID: string) {
        let where: any;
        if (this.isUuid(userID)) {
            where = [{ ownerId: userID }, { firebaseUid: userID }];
        } else {
            const linkedUser = await this.findUserByIdentifier(userID);
            where = linkedUser
                ? [{ ownerId: linkedUser.id }, { firebaseUid: userID }]
                : { firebaseUid: userID };
        }

        const lists = await this.listRepository.find({
            where,
            order: {
                createdAt: 'DESC',
            },
        });

        return lists;
    }

    async findOne(id: string) {
        // TODO(authz): enforce list visibility rules for direct list lookups.
        const list = await this.listRepository.findOne({
            where: { id },
        });

        if (!list) {
            throw new NotFoundException('List not found');
        }

        return list;
    }

    async likeList(listId: string, viewerIdentifier: string) {
        const viewer = await this.requireUserByIdentifier(viewerIdentifier, "Viewer");
        const list = await this.findOne(listId);

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
        const list = await this.findOne(listId);

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
        const list = await this.findOne(listId);

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
        const totalCount = await this.listLikeRepository.count({
            where: { userId: viewer.id },
        });

        const likes = await this.listLikeRepository.find({
            where: { userId: viewer.id },
            relations: ["list"],
            skip: offset,
            take: limit,
            order: { createdAt: "DESC" },
        });

        const likedLists = likes
            .map((like) => like.list)
            .filter((list): list is AlbumList => Boolean(list));

        return {
            data: likedLists,
            hasMore: offset + likedLists.length < totalCount,
            totalCount,
        };
    }

    async update(id: string, updateListDto: UpdateListDto, currentUserOauthId: string) {
        const list = await this.requireListOwner(id, currentUserOauthId);
        const normalizedAlbumIds = this.normalizeAlbumIds(
            updateListDto.albumIds ?? updateListDto.albumList,
        );

        if (updateListDto.title !== undefined) {
            list.title = updateListDto.title;
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

    private async requireListOwner(listId: string, currentUserOauthId: string): Promise<AlbumList> {
        const currentUser = await this.requireUserByIdentifier(currentUserOauthId, "Authenticated user");
        const list = await this.findOne(listId);

        if (list.ownerId !== currentUser.id) {
            // TODO(authz): allow admin/mod list management and collaborative editor permissions.
            throw new ForbiddenException("You can only modify your own lists");
        }

        return list;
    }
}
