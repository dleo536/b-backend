import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { Review, ReviewVisibility } from "./review.entity";
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

    private buildReviewConditions(
        baseConditions: Array<Record<string, unknown>>,
        includeDrafts: boolean,
    ) {
        const conditions = baseConditions
            .filter((condition) => Boolean(condition))
            .map((condition) => (
                includeDrafts
                    ? { ...condition }
                    : { ...condition, isDraft: false }
            ));

        if (conditions.length === 0) {
            return includeDrafts ? {} : { isDraft: false };
        }

        return conditions.length === 1 ? conditions[0] : conditions;
    }

    private buildUserReviewWhere(
        userIdentifier: string,
        resolvedUserId: string | null,
        includeDrafts: boolean,
    ) {
        const normalizedIdentifier = userIdentifier?.trim();
        const baseConditions: Array<Record<string, unknown>> = [];

        if (resolvedUserId) {
            baseConditions.push({ userId: resolvedUserId });
        }

        if (normalizedIdentifier) {
            if (this.isUuid(normalizedIdentifier)) {
                if (normalizedIdentifier !== resolvedUserId) {
                    baseConditions.push({ userId: normalizedIdentifier });
                }
            } else {
                baseConditions.push({ firebaseUid: normalizedIdentifier });
            }
        }

        return this.buildReviewConditions(baseConditions, includeDrafts);
    }

    private appendViewerDraftAccess(where: any, viewerUserId: string | null) {
        if (!viewerUserId) {
            return where;
        }

        const baseConditions = Array.isArray(where) ? where : [where];
        const draftConditions = baseConditions.map((condition) => {
            const normalizedCondition = { ...(condition ?? {}) };
            delete normalizedCondition.isDraft;
            delete normalizedCondition.userId;

            return {
                ...normalizedCondition,
                userId: viewerUserId,
                isDraft: true,
            };
        });

        return [...baseConditions, ...draftConditions];
    }

    private normalizeReviewForResponse(review: Review): Review {
        review.visibility = ReviewVisibility.PUBLIC;

        return review;
    }

    private normalizeReviewsForResponse(reviews: Review[]): Review[] {
        return reviews.map((review) => this.normalizeReviewForResponse(review));
    }

    private async getReviewOrThrow(id: string): Promise<Review> {
        const review = await this.reviewRepository.findOne({
            where: { id },
        });

        if (!review) {
            throw new NotFoundException("Review not found");
        }

        return review;
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
            isDraft,
            // Launch rule: all published reviews are public.
            visibility: ReviewVisibility.PUBLIC,
            listenedOn: createReviewDto.listenedOn,
            relistenCount: createReviewDto.relistenCount ?? 0,
            trackHighlights: createReviewDto.trackHighlights,
            tags: createReviewDto.tags ?? [],
            publishedAt: isDraft ? undefined : new Date(),
        });
        const result: Review = await this.reviewRepository.save(review);
        return this.normalizeReviewForResponse(result);
    }

    async findAll(
        userID?: string,
        offset: number = 0,
        limit: number = 10,
        viewerUid?: string,
        spotifyAlbumId?: string,
        releaseGroupMbId?: string,
    ) {
        // Build the query filter
        const normalizedViewerUid = viewerUid?.trim() || undefined;
        const viewerUser = await this.findUserByIdentifier(normalizedViewerUid);
        const viewerUserId = viewerUser?.id ?? null;
        let where: any = { isDraft: false };
        let followFilterMode: "global" | "following" | "global-fallback" | "user" = "global";

        if (userID) {
            followFilterMode = "user";
            const linkedUser = await this.findUserByIdentifier(userID);
            const linkedUserId = linkedUser?.id ?? (this.isUuid(userID) ? userID : null);
            const includeDrafts = Boolean(
                normalizedViewerUid && (
                    normalizedViewerUid === userID ||
                    (viewerUserId && linkedUserId && viewerUserId === linkedUserId)
                ),
            );

            where = this.buildUserReviewWhere(userID, linkedUserId, includeDrafts);
        } else if (normalizedViewerUid) {
            if (viewerUser) {
                const follows = await this.followRepository.find({
                    where: { followerId: viewerUser.id },
                });
                const followedIds = follows.map((follow) => follow.followingId);
                const filteredUserIds = Array.from(new Set([...followedIds, viewerUser.id]));

                if (followedIds.length > 0) {
                    const followedOnlyWhere = this.appendAlbumFilter(
                        { userId: In(followedIds), isDraft: false },
                        spotifyAlbumId,
                        releaseGroupMbId,
                    );
                    const followedOnlyCount = await this.reviewRepository.count({ where: followedOnlyWhere });

                    if (followedOnlyCount > 0) {
                        const publicFeedWhere = this.appendAlbumFilter(
                            { userId: In(filteredUserIds), isDraft: false },
                            spotifyAlbumId,
                            releaseGroupMbId,
                        );
                        const filteredWhere = this.appendViewerDraftAccess(publicFeedWhere, viewerUser.id);
                        const filteredTotalCount = await this.reviewRepository.count({ where: filteredWhere });
                        const reviews = await this.reviewRepository.find({
                            where: filteredWhere,
                            skip: offset,
                            take: limit,
                            order: {
                                createdAt: "DESC",
                            },
                        });
                        const hasMore = offset + reviews.length < filteredTotalCount;

                        return {
                            data: this.normalizeReviewsForResponse(reviews),
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
        if (!userID) {
            where = this.appendViewerDraftAccess(where, viewerUserId);
        }

        this.logger.log(
            `[findAll] userID=${userID ?? "none"} authUserId=${viewerUserId ?? "none"} mode=${followFilterMode} spotifyAlbumId=${spotifyAlbumId ?? "none"} releaseGroupMbId=${releaseGroupMbId ?? "none"} where=${JSON.stringify(where)} offset=${offset} limit=${limit}`,
        );

        // Get the total count of matching reviews
        const totalCount = await this.reviewRepository.count({ where });

        // Fetch the paginated reviews
        const reviews = await this.reviewRepository.find({
            where,
            skip: offset,
            take: limit,
            order: {
                createdAt: "DESC",
            },
        });

        const hasMore = offset + reviews.length < totalCount;

        return {
            data: this.normalizeReviewsForResponse(reviews),
            hasMore,
            totalCount,
            mode: followFilterMode,
        };
    }

    async findOne(id: string, viewerUid?: string) {
        const review = await this.getReviewOrThrow(id);

        if (!review.isDraft) {
            return this.normalizeReviewForResponse(review);
        }

        const normalizedViewerUid = viewerUid?.trim();
        if (!normalizedViewerUid) {
            throw new NotFoundException("Review not found");
        }

        const viewerUser = await this.findUserByIdentifier(normalizedViewerUid);
        const isOwner = Boolean(
            (viewerUser && viewerUser.id === review.userId) ||
            review.firebaseUid === normalizedViewerUid,
        );

        if (!isOwner) {
            throw new NotFoundException("Review not found");
        }

        return this.normalizeReviewForResponse(review);
    }

    async update(id: string, updateReviewDto: UpdateReviewDto, currentUserOauthId: string) {
        const review = await this.requireReviewAuthor(id, currentUserOauthId);
        const nextIsDraft = updateReviewDto.isDraft ?? review.isDraft;

        if (!nextIsDraft) {
            const existingPublishedReview = await this.reviewRepository.findOne({
                where: {
                    userId: review.userId,
                    releaseGroupMbId: review.releaseGroupMbId,
                    isDraft: false,
                },
            });

            if (existingPublishedReview && existingPublishedReview.id !== review.id) {
                throw new ConflictException(
                    `A published review already exists for this album. Use PATCH /reviews/${existingPublishedReview.id} to update it, or keep this review as a draft.`,
                );
            }
        }

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
        review.isDraft = nextIsDraft;
        review.visibility = ReviewVisibility.PUBLIC;
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

        if (!review.isDraft && !review.publishedAt) {
            review.publishedAt = new Date();
        }

        const result = await this.reviewRepository.save(review);
        return this.normalizeReviewForResponse(result);
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

        const review = await this.getReviewOrThrow(id);
        if (review.userId !== currentUser.id) {
            // TODO(authz): allow admin/mod review moderation separately from author ownership.
            throw new ForbiddenException("You can only modify your own reviews");
        }

        return review;
    }
}
