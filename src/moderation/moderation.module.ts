import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../user/user.entity";
import { Review } from "../review/review.entity";
import { AlbumList } from "../list/list.entity";
import { UserFollow } from "../user/follow.entity";
import { ContentReport } from "./content-report.entity";
import { UserBlock } from "./user-block.entity";
import { ModerationService } from "./moderation.service";
import { ModerationController } from "./moderation.controller";
import { AdminReportController } from "./admin-report.controller";

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Review,
            AlbumList,
            UserFollow,
            ContentReport,
            UserBlock,
        ]),
    ],
    controllers: [ModerationController, AdminReportController],
    providers: [ModerationService],
    exports: [ModerationService],
})
export class ModerationModule {}
