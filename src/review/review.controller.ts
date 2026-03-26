import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { OptionalFirebaseAuthGuard } from "../auth/optional-firebase-auth.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ReviewService } from "./review.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { toReviewResponse, toReviewResponses } from "./review-response";

const parseNonNegativeInt = (
    value: string | undefined,
    fallback: number,
    max: number,
) => {
    const parsed = Number.parseInt(value ?? "", 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return Math.min(parsed, max);
};

@Controller('reviews')
export class ReviewController {
    constructor(private readonly reviewService: ReviewService) {}

    @UseGuards(FirebaseAuthGuard)
    @Post()
    create(
        @Body() createReviewDto: CreateReviewDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.reviewService
            .create(createReviewDto, currentUser.uid)
            .then((review) => toReviewResponse(review));
    }

    @UseGuards(OptionalFirebaseAuthGuard)
    @Get()
    findAll(
        @Query('userID') userID?: string,
        @Query('userId') userId?: string,
        @Query('spotifyAlbumId') spotifyAlbumId?: string,
        @Query('releaseGroupMbId') releaseGroupMbId?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        const offsetNum = parseNonNegativeInt(offset, 0, 200);
        const limitNum = parseNonNegativeInt(limit, 10, 200);
        return this.reviewService.findAll(
            userID ?? userId,
            offsetNum,
            limitNum,
            currentUser?.uid,
            spotifyAlbumId,
            releaseGroupMbId,
        ).then((result) => ({
            ...result,
            data: toReviewResponses(result.data),
        }));
    }

    @UseGuards(OptionalFirebaseAuthGuard)
    @Get(':id')
    findOne(
        @Param('id') id: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        return this.reviewService
            .findOne(id, currentUser?.uid)
            .then((review) => toReviewResponse(review));
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateReviewDto: UpdateReviewDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.reviewService
            .update(id, updateReviewDto, currentUser.uid)
            .then((review) => toReviewResponse(review));
    }

    @UseGuards(FirebaseAuthGuard)
    @Delete(':id')
    remove(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.reviewService.remove(id, currentUser.uid);
    }
}
