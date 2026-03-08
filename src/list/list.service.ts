import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";
import { AlbumList } from "./list.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";

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

    async create(createListDto: CreateListDto) {
        // Map Firebase UID to User UUID
        let user = await this.userRepository.findOne({
            where: { oauthId: createListDto.firebaseUid },
        });

        // Fallback if caller already resolved backend ownerId (UUID)
        if (!user && createListDto.ownerId && this.isUuid(createListDto.ownerId)) {
            user = await this.userRepository.findOne({
                where: { id: createListDto.ownerId },
            });
        }

        // Fallback for environments where a UUID is being passed directly.
        if (!user && this.isUuid(createListDto.firebaseUid)) {
            user = await this.userRepository.findOne({
                where: { id: createListDto.firebaseUid },
            });
        }

        if (!user) {
            throw new NotFoundException(`User with Firebase UID ${createListDto.firebaseUid} not found`);
        }

        // Self-heal older users created before oauthId was populated.
        if (!user.oauthId && createListDto.firebaseUid) {
            user.oauthId = createListDto.firebaseUid;
            await this.userRepository.save(user);
        }

        const albumIds =
            this.normalizeAlbumIds(createListDto.albumIds ?? createListDto.albumList) ?? [];

        const list = this.listRepository.create({
            title: createListDto.title,
            slug: createListDto.slug,
            description: createListDto.description,
            visibility: createListDto.visibility,
            listType: createListDto.listType,
            ownerId: user.id, // Use User UUID for FK
            firebaseUid: createListDto.firebaseUid, // Store Firebase UID separately
            albumIds,
            itemsCount: albumIds.length,
        });
        const result = await this.listRepository.save(list);
        return result;
    }

    async findAll(userID?: string, offset: number = 0, limit: number = 10, viewerUid?: string) {
        let where: any = {};
        let linkedUserId: string | null = null;
        let followFilterMode: "global" | "following" | "user" = "global";
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

                this.logger.log(
                    `[findAll] viewerUid=${viewerUid} authUserId=${viewerUser.id} followedCount=${followedIds.length}`,
                );

                if (followedIds.length > 0) {
                    where = { ownerId: In(filteredOwnerIds) };
                    followFilterMode = "following";
                }
            } else {
                this.logger.warn(`[findAll] viewerUid=${viewerUid} could not be resolved to a user`);
            }
        }

        this.logger.log(
            `[findAll] userID=${userID ?? "none"} viewerUid=${viewerUid ?? "none"} linkedUserId=${linkedUserId ?? "none"} mode=${followFilterMode} offset=${offset} limit=${limit} where=${JSON.stringify(where)}`,
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
        const list = await this.listRepository.findOne({
            where: { id },
        });

        if (!list) {
            throw new NotFoundException('List not found');
        }

        return list;
    }

    async update(id: string, updateListDto: UpdateListDto) {
        const list = await this.findOne(id);
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

    async remove(id: string) {
        const list = await this.findOne(id);
        const result = await this.listRepository.remove(list);
        return result;
    }
}
