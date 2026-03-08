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
        // Map Firebase UID to User UUID
        const user = await this.userRepository.findOne({
            where: { oauthId: createReviewDto.firebaseUid },
        });

        if (!user) {
            throw new NotFoundException(`User with Firebase UID ${createReviewDto.firebaseUid} not found`);
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
            firebaseUid: createReviewDto.firebaseUid, // Store Firebase UID separately
        });
        const result = await this.reviewRepository.save(review);
        return result;
    }

    async findAll(userID?: string, offset: number = 0, limit: number = 10, viewerUid?: string) {
        // Build the query filter
        let where: any = {};
        let followFilterMode: "global" | "following" | "user" = "global";
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
                    where.userId = In(filteredUserIds);
                    followFilterMode = "following";
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
