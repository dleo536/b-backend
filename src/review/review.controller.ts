import { Controller, Post, Body, Get, Param, Patch, Delete, Query } from "@nestjs/common";
import { ReviewService } from "./review.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";

@Controller('reviews')
export class ReviewController {
    constructor(private readonly reviewService: ReviewService) {}

    @Post()
    create(@Body() createReviewDto: CreateReviewDto) {
        return this.reviewService.create(createReviewDto);
    }

    @Get()
    findAll(
        @Query('userID') userID?: string,
        @Query('userId') userId?: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
    ) {
        const offsetNum = offset ? parseInt(offset) : 0;
        const limitNum = limit ? parseInt(limit) : 10;
        return this.reviewService.findAll(
            userID ?? userId,
            offsetNum,
            limitNum,
            viewerId ?? viewerUid,
        );
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.reviewService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateReviewDto: UpdateReviewDto) {
        return this.reviewService.update(id, updateReviewDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.reviewService.remove(id);
    }
}
