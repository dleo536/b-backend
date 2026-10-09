import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { AdminReviewController } from './admin-review.controller';
import { Review } from './review.entity';
import { ReviewLike } from './review-like.entity';
import { User } from '../user/user.entity';
import { UserFollow } from '../user/follow.entity';
import { MetadataModule } from '../metadata/metadata.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, ReviewLike, User, UserFollow]),
    MetadataModule,
  ],
  controllers: [ReviewController, AdminReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
