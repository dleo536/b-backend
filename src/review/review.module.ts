import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReviewService } from "./review.service";
import { ReviewController } from "./review.controller";
import { Review } from "./review.entity";
import { User } from "../user/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Review, User])],
    controllers: [ReviewController],
    providers: [ReviewService],
})
export class ReviewModule { }