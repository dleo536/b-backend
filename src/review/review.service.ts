import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from "@nestjs/common";
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

    async create(createReviewDto: CreateReviewDto) {
        const firebaseUid = createReviewDto.firebaseUid?.trim();
        const userId = createReviewDto.userId?.trim();
        const identifiers = [firebaseUid, userId]
            .filter((value): value is string => typeof value === "string" && value.length > 0);

        this.logger.log(
            `[create] identifiers=${identifiers.join(",") || "none"} firebaseUid=${firebaseUid ?? "none"} userId=${userId ?? "none"} releaseGroupMbId=${createReviewDto.releaseGroupMbId}`,
        );

        if (identifiers.length === 0) {
            throw new BadRequestException("firebaseUid or userId is required to create a review");
        }

        let user: User | null = null;
        let matchedIdentifier: string | null = null;
        for (const identifier of identifiers) {
            user = await this.findUserByIdentifier(identifier);
            if (user) {
                matchedIdentifier = identifier;
                break;
            }
        }

        if (!user) {
            throw new NotFoundException(`User with identifier(s) ${identifiers.join(", ")} not found`);
        }

        // Self-heal older users created before oauthId was populated.
        if (!user.oauthId && matchedIdentifier && !this.isUuid(matchedIdentifier)) {
            user.oauthId = matchedIdentifier;
            await this.userRepository.save(user);
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
            ...createReviewDto,
            userId: user.id, // Use User UUID for FK
            firebaseUid: firebaseUid || user.oauthId || (matchedIdentifier && !this.isUuid(matchedIdentifier) ? matchedIdentifier : undefined), // Store Firebase UID separately
        });
        const result = await this.reviewRepository.save(review);
        return result;
    }

    async findAll(userID?: string, offset: number = 0, limit: number = 10, viewerUid?: string) {
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

                this.logger.log(
                    `[findAll] viewerUid=${viewerUid} authUserId=${viewerUser.id} followedCount=${followedIds.length}`,
                );

                if (followedIds.length > 0) {
                    const followedOnlyWhere = { userId: In(followedIds) };
                    const followedOnlyCount = await this.reviewRepository.count({ where: followedOnlyWhere });

                    this.logger.log(
                        `[findAll] following-only totalCount=${followedOnlyCount} where=${JSON.stringify(followedOnlyWhere)}`,
                    );

                    if (followedOnlyCount > 0) {
                        const filteredWhere = { userId: In(filteredUserIds) };
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
                this.logger.warn(`[findAll] viewerUid=${viewerUid} could not be resolved to a user`);
            }
        }

        this.logger.log(
            `[findAll] userID=${userID ?? "none"} viewerUid=${viewerUid ?? "none"} authUserId=${authUserId ?? "none"} mode=${followFilterMode} where=${JSON.stringify(where)} offset=${offset} limit=${limit}`,
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
        const review = await this.reviewRepository.findOne({
            where: { id },
        });

        if (!review) {
            throw new NotFoundException('Review not found');
        }

        return review;
    }

    async update(id: string, updateReviewDto: UpdateReviewDto) {
        const review = await this.findOne(id);
        Object.assign(review, updateReviewDto);
        const result = await this.reviewRepository.save(review);
        return result;
    }

    async remove(id: string) {
        const review = await this.findOne(id);
        const result = await this.reviewRepository.remove(review);
        return result;
    }
}
