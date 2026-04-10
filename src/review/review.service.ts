import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { Review, ReviewVisibility } from "./review.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";
import { AuthUserContextService } from "../auth/auth-user-context.service";
import { ModerationService } from "../moderation/moderation.service";

@Injectable()
export class ReviewService {
    constructor(
        @InjectRepository(Review)
        private reviewRepository: Repository<Review>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserFollow)
        private followRepository: Repository<UserFollow>,
        private readonly authUserContextService: AuthUserContextService,
        private readonly moderationService: ModerationService,
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

    private normalizeReviewVisibility(visibility?: string) {
        if (visibility === undefined || visibility === null || visibility === "") {
            return ReviewVisibility.PUBLIC;
        }

        return visibility === ReviewVisibility.PUBLIC
            ? ReviewVisibility.PUBLIC
            : ReviewVisibility.PRIVATE;
    }

    private isReviewPublic(review: Review): boolean {
        return this.normalizeReviewVisibility(review.visibility) === ReviewVisibility.PUBLIC;
    }

    private canViewReview(review: Review, viewerUserId?: string | null): boolean {
        if (review.isDraft) {
            return Boolean(viewerUserId) && review.userId === viewerUserId;
        }

        return this.isReviewPublic(review) || (Boolean(viewerUserId) && review.userId === viewerUserId);
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

    private buildReadableReviewWhere(
        baseWhere: any,
        ownerAccessUserId?: string | null,
        includeOwnerDrafts = false,
    ) {
        const baseConditions = this.toWhereConditions(baseWhere);
        const publicConditions = baseConditions.map((condition) => ({
            ...condition,
            isDraft: false,
            visibility: ReviewVisibility.PUBLIC,
        }));

        if (!ownerAccessUserId) {
            return publicConditions.length === 1 ? publicConditions[0] : publicConditions;
        }

        const ownerConditions = baseConditions.map((condition) => {
            const nextCondition: Record<string, unknown> = {
                ...condition,
                userId: ownerAccessUserId,
            };
            delete nextCondition.firebaseUid;
            delete nextCondition.visibility;
            if (includeOwnerDrafts) {
                delete nextCondition.isDraft;
            } else {
                nextCondition.isDraft = false;
            }

            return nextCondition;
        });

        const conditions = this.dedupeWhereConditions([
            ...publicConditions,
            ...ownerConditions,
        ]);

        return conditions.length === 1 ? conditions[0] : conditions;
    }

    private normalizeReviewForResponse(review: Review): Review {
        review.visibility = this.normalizeReviewVisibility(review.visibility);

        return review;
    }

    private normalizeReviewsForResponse(reviews: Review[]): Review[] {
        return reviews.map((review) => this.normalizeReviewForResponse(review));
    }

    private appendExcludedUserIds(where: any, excludedUserIds: string[]) {
        if (!excludedUserIds.length) {
            return where;
        }

        const nextConditions = this.toWhereConditions(where)
            .map((condition) => {
                const nextCondition = condition ?? {};

                if (typeof nextCondition.userId === "string") {
                    return excludedUserIds.includes(nextCondition.userId)
                        ? null
                        : nextCondition;
                }

                if (nextCondition.userId !== undefined) {
                    return nextCondition;
                }

                return {
                    ...nextCondition,
                    userId: Not(In(excludedUserIds)),
                };
            })
            .filter((condition): condition is Record<string, unknown> => Boolean(condition));

        if (nextConditions.length === 0) {
            return { userId: In([]) };
        }

        return nextConditions.length === 1 ? nextConditions[0] : nextConditions;
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

        this.moderationService.assertTextFieldsAreAllowed([
            { label: "review headline", value: createReviewDto.headline },
            { label: "review body", value: createReviewDto.body },
            { label: "review tags", value: createReviewDto.tags?.join(" ") },
        ]);

        // If creating a non-draft review, check if one already exists
        const isDraft = createReviewDto.isDraft ?? false;
        const visibility = this.normalizeReviewVisibility(createReviewDto.visibility);
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
            visibility,
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
        const normalizedViewerUid = viewerUid?.trim() || undefined;
        const viewerUser = await this.findUserByIdentifier(normalizedViewerUid);
        const viewerUserId = viewerUser?.id ?? null;
        const excludedUserIds = viewerUserId
            ? await this.moderationService.getVisibilityExcludedUserIds(viewerUserId)
            : [];
        let where: any = this.buildReadableReviewWhere({}, viewerUserId, true);
        let followFilterMode: "global" | "following" | "global-fallback" | "user" = "global";

        if (userID) {
            followFilterMode = "user";
            const linkedUser = await this.findUserByIdentifier(userID);
            const linkedUserId = linkedUser?.id ?? (this.isUuid(userID) ? userID : null);
            if (linkedUserId && excludedUserIds.includes(linkedUserId) && linkedUserId !== viewerUserId) {
                return {
                    data: [],
                    hasMore: false,
                    totalCount: 0,
                    mode: followFilterMode,
                };
            }
            const normalizedIdentifier = userID?.trim();
            const baseConditions: Array<Record<string, unknown>> = [];

            if (linkedUserId) {
                baseConditions.push({ userId: linkedUserId });
            }

            if (normalizedIdentifier) {
                if (this.isUuid(normalizedIdentifier)) {
                    if (normalizedIdentifier !== linkedUserId) {
                        baseConditions.push({ userId: normalizedIdentifier });
                    }
                } else {
                    baseConditions.push({ firebaseUid: normalizedIdentifier });
                }
            }

            const ownerAccessUserId =
                viewerUserId && linkedUserId && viewerUserId === linkedUserId
                    ? viewerUserId
                    : null;

            where = this.buildReadableReviewWhere(
                baseConditions,
                ownerAccessUserId,
                Boolean(ownerAccessUserId),
            );
        } else if (normalizedViewerUid) {
            if (viewerUser) {
                const follows = await this.followRepository.find({
                    where: { followerId: viewerUser.id },
                });
                const followedIds = follows
                    .map((follow) => follow.followingId)
                    .filter((followedId) => !excludedUserIds.includes(followedId));
                const filteredUserIds = Array.from(new Set([...followedIds, viewerUser.id]));

                if (followedIds.length > 0) {
                    const followedOnlyWhere = this.appendAlbumFilter(
                        this.buildReadableReviewWhere(
                            { userId: In(followedIds) },
                            null,
                            false,
                        ),
                        spotifyAlbumId,
                        releaseGroupMbId,
                    );
                    const followedOnlyCount = await this.reviewRepository.count({ where: followedOnlyWhere });

                    if (followedOnlyCount > 0) {
                        const filteredWhere = this.appendAlbumFilter(
                            this.buildReadableReviewWhere(
                                { userId: In(filteredUserIds) },
                                viewerUser.id,
                                true,
                            ),
                            spotifyAlbumId,
                            releaseGroupMbId,
                        );
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
            }
        }

        where = this.appendAlbumFilter(where, spotifyAlbumId, releaseGroupMbId);
        where = this.appendExcludedUserIds(where, excludedUserIds);

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
        const viewerUser = await this.findUserByIdentifier(viewerUid?.trim() || undefined);
        const viewerUserId = viewerUser?.id ?? null;

        if (!this.canViewReview(review, viewerUserId)) {
            throw new NotFoundException("Review not found");
        }

        if (viewerUserId && await this.moderationService.isBlockedBetweenUsersByIds(viewerUserId, review.userId)) {
            throw new NotFoundException("Review not found");
        }

        return this.normalizeReviewForResponse(review);
    }

    async update(id: string, updateReviewDto: UpdateReviewDto, currentUserOauthId: string) {
        const review = await this.requireReviewAuthor(id, currentUserOauthId);
        const nextIsDraft = updateReviewDto.isDraft ?? review.isDraft;

        this.moderationService.assertTextFieldsAreAllowed([
            { label: "review headline", value: updateReviewDto.headline },
            { label: "review body", value: updateReviewDto.body },
            { label: "review tags", value: updateReviewDto.tags?.join(" ") },
        ]);

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
        if (updateReviewDto.visibility !== undefined) {
            review.visibility = this.normalizeReviewVisibility(updateReviewDto.visibility);
        } else {
            review.visibility = this.normalizeReviewVisibility(review.visibility);
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

    async removeAsAdmin(id: string, currentUserOauthId: string) {
        await this.authUserContextService.requireAdminByOauthId(currentUserOauthId);
        const review = await this.getReviewOrThrow(id);
        return this.reviewRepository.softRemove(review);
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
