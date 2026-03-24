import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { Review } from "./review.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";

@Injectable()
export class ReviewService {
    private readonly logger = new Logger(ReviewService.name);

    constructor(
        @InjectRepository(Review)
        private reviewRepository: Repository<Review>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserFollow)
        private followRepository: Repository<UserFollow>,
    ) { }

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

    private appendAlbumFilter(
        where: any,
        spotifyAlbumId?: string,
        releaseGroupMbId?: string,
    ) {
        const normalizedSpotifyAlbumId = spotifyAlbumId?.trim();
        const normalizedReleaseGroupMbId = releaseGroupMbId?.trim();

        if (!normalizedSpotifyAlbumId && !normalizedReleaseGroupMbId) {
            return where;
        }

        const baseConditions = Array.isArray(where) ? where : [where];
        const nextConditions = baseConditions.flatMap((condition) => {
            const normalizedCondition = condition ?? {};
            const filters: any[] = [];

            if (normalizedSpotifyAlbumId) {
                filters.push({
                    ...normalizedCondition,
                    spotifyAlbumId: normalizedSpotifyAlbumId,
                });
            }

            if (normalizedReleaseGroupMbId) {
                filters.push({
                    ...normalizedCondition,
                    releaseGroupMbId: normalizedReleaseGroupMbId,
                });
            }

            return filters;
        });

        if (nextConditions.length === 1) {
            return nextConditions[0];
        }

        return nextConditions;
    }

    async create(createReviewDto: CreateReviewDto, currentUserOauthId: string) {
        if (!currentUserOauthId?.trim()) {
            throw new BadRequestException("Authenticated Firebase uid is required");
        }

        const user = await this.findUserByIdentifier(currentUserOauthId);

        if (!user) {
            throw new NotFoundException("Authenticated user profile not found");
        }

        // If creating a non-draft review, check if one already exists
        const isDraft = createReviewDto.isDraft ?? false;
        if (!isDraft) {
            const existingReview = await this.reviewRepository.findOne({
                where: {
                    userId: user.id,
                    releaseGroupMbId: createReviewDto.releaseGroupMbId,
                    isDraft: false,
                },
            });

            if (existingReview) {
                throw new ConflictException(
                    `A published review already exists for this album. Use PATCH /reviews/${existingReview.id} to update it, or create a draft review by setting isDraft: true.`
                );
            }
        }

        const review = this.reviewRepository.create({
            userId: user.id,
            firebaseUid: currentUserOauthId,
            releaseGroupMbId: createReviewDto.releaseGroupMbId,
            releaseMbId: createReviewDto.releaseMbId,
            artistMbId: createReviewDto.artistMbId,
            spotifyAlbumId: createReviewDto.spotifyAlbumId,
            albumTitleSnapshot: createReviewDto.albumTitleSnapshot,
            artistNameSnapshot: createReviewDto.artistNameSnapshot,
            coverUrlSnapshot: createReviewDto.coverUrlSnapshot,
            ratingHalfSteps: createReviewDto.ratingHalfSteps,
            headline: createReviewDto.headline,
            body: createReviewDto.body,
            isSpoiler: createReviewDto.isSpoiler ?? false,
            isDraft: createReviewDto.isDraft ?? false,
            visibility: createReviewDto.visibility,
            listenedOn: createReviewDto.listenedOn,
            relistenCount: createReviewDto.relistenCount ?? 0,
            trackHighlights: createReviewDto.trackHighlights,
            tags: createReviewDto.tags ?? [],
        });
        const result = await this.reviewRepository.save(review);
        return result;
    }

    async findAll(
        userID?: string,
        offset: number = 0,
        limit: number = 10,
        viewerUid?: string,
        spotifyAlbumId?: string,
        releaseGroupMbId?: string,
    ) {
        // TODO(authz): enforce review visibility rules on public read paths.
        // Build the query filter
        let where: any = {};
        let followFilterMode: "global" | "following" | "global-fallback" | "user" = "global";
        let authUserId: string | null = null;
        if (userID) {
            followFilterMode = "user";
            if (this.isUuid(userID)) {
                where = [{ userId: userID }, { firebaseUid: userID }];
            } else {
                const linkedUser = await this.findUserByIdentifier(userID);
                authUserId = linkedUser?.id ?? null;
                if (linkedUser) {
                    where = [{ userId: linkedUser.id }, { firebaseUid: userID }];
                } else {
                    where = { firebaseUid: userID };
                }
            }
        } else if (viewerUid) {
            const viewerUser = await this.findUserByIdentifier(viewerUid);
            authUserId = viewerUser?.id ?? null;

            if (viewerUser) {
                const follows = await this.followRepository.find({
                    where: { followerId: viewerUser.id },
                });
                const followedIds = follows.map((follow) => follow.followingId);
                const filteredUserIds = Array.from(new Set([...followedIds, viewerUser.id]));

                if (followedIds.length > 0) {
                    const followedOnlyWhere = this.appendAlbumFilter(
                        { userId: In(followedIds) },
                        spotifyAlbumId,
                        releaseGroupMbId,
                    );
                    const followedOnlyCount = await this.reviewRepository.count({ where: followedOnlyWhere });

                    if (followedOnlyCount > 0) {
                        const filteredWhere = this.appendAlbumFilter(
                            { userId: In(filteredUserIds) },
                            spotifyAlbumId,
                            releaseGroupMbId,
                        );
                        const filteredTotalCount = await this.reviewRepository.count({ where: filteredWhere });
                        const reviews = await this.reviewRepository.find({
                            where: filteredWhere,
                            skip: offset,
                            take: limit,
                            order: {
                                createdAt: 'DESC',
                            },
                        });
                        const hasMore = offset + reviews.length < filteredTotalCount;

                        return {
                            data: reviews,
                            hasMore,
                            totalCount: filteredTotalCount,
                            mode: "following",
                        };
                    }

                    followFilterMode = "global-fallback";
                }
            } else {
                this.logger.warn("[findAll] viewer token could not be resolved to a user profile");
            }
        }

        where = this.appendAlbumFilter(where, spotifyAlbumId, releaseGroupMbId);

        this.logger.log(
            `[findAll] userID=${userID ?? "none"} authUserId=${authUserId ?? "none"} mode=${followFilterMode} spotifyAlbumId=${spotifyAlbumId ?? "none"} releaseGroupMbId=${releaseGroupMbId ?? "none"} where=${JSON.stringify(where)} offset=${offset} limit=${limit}`,
        );

        // Get the total count of matching reviews
        const totalCount = await this.reviewRepository.count({ where });

        // Fetch the paginated reviews
        const reviews = await this.reviewRepository.find({
            where,
            skip: offset,
            take: limit,
            order: {
                createdAt: 'DESC',
            },
        });

        const hasMore = offset + reviews.length < totalCount;

        return {
            data: reviews,
            hasMore,
            totalCount,
            mode: followFilterMode,
        };
    }

    async findOne(id: string) {
        // TODO(authz): enforce review visibility rules for direct review lookups.
        const review = await this.reviewRepository.findOne({
            where: { id },
        });

        if (!review) {
            throw new NotFoundException('Review not found');
        }

        return review;
    }

    async update(id: string, updateReviewDto: UpdateReviewDto, currentUserOauthId: string) {
        const review = await this.requireReviewAuthor(id, currentUserOauthId);

        if (updateReviewDto.ratingHalfSteps !== undefined) {
            review.ratingHalfSteps = updateReviewDto.ratingHalfSteps;
        }
        if (updateReviewDto.headline !== undefined) {
            review.headline = updateReviewDto.headline;
        }
        if (updateReviewDto.body !== undefined) {
            review.body = updateReviewDto.body;
        }
        if (updateReviewDto.isSpoiler !== undefined) {
            review.isSpoiler = updateReviewDto.isSpoiler;
        }
        if (updateReviewDto.isDraft !== undefined) {
            review.isDraft = updateReviewDto.isDraft;
        }
        if (updateReviewDto.visibility !== undefined) {
            review.visibility = updateReviewDto.visibility;
        }
        if (updateReviewDto.listenedOn !== undefined) {
            review.listenedOn = updateReviewDto.listenedOn;
        }
        if (updateReviewDto.relistenCount !== undefined) {
            review.relistenCount = updateReviewDto.relistenCount;
        }
        if (updateReviewDto.trackHighlights !== undefined) {
            review.trackHighlights = updateReviewDto.trackHighlights;
        }
        if (updateReviewDto.tags !== undefined) {
            review.tags = updateReviewDto.tags;
        }

        const result = await this.reviewRepository.save(review);
        return result;
    }

    async remove(id: string, currentUserOauthId: string) {
        const review = await this.requireReviewAuthor(id, currentUserOauthId);
        const result = await this.reviewRepository.remove(review);
        return result;
    }

    private async requireReviewAuthor(id: string, currentUserOauthId: string): Promise<Review> {
        const currentUser = await this.findUserByIdentifier(currentUserOauthId);
        if (!currentUser) {
            throw new NotFoundException("Authenticated user profile not found");
        }

        const review = await this.findOne(id);
        if (review.userId !== currentUser.id) {
            // TODO(authz): allow admin/mod review moderation separately from author ownership.
            throw new ForbiddenException("You can only modify your own reviews");
        }

        return review;
    }
}
