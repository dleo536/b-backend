import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReviewService } from "./review.service";
import { ReviewController } from "./review.controller";
import { AdminReviewController } from "./admin-review.controller";
import { Review } from "./review.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Review, User, UserFollow])],
    controllers: [ReviewController, AdminReviewController],
    providers: [ReviewService],
})
export class ReviewModule { }
