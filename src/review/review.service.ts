import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { Review } from "./review.entity";
import { User } from "../user/user.entity";

@Injectable()
export class ReviewService {
    constructor(
        @InjectRepository(Review)
        private reviewRepository: Repository<Review>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

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

    async findAll(userID?: string, offset: number = 0, limit: number = 10) {
        // Build the query filter
        const where: any = {};
        if (userID) {
            where.userId = userID;
        }

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