import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ListService } from "./list.service";
import { ListController } from "./list.controller";
import { AlbumList } from "./list.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";
import { ListLike } from "./list-like.entity";

@Module({
    imports: [TypeOrmModule.forFeature([AlbumList, User, UserFollow, ListLike])],
    controllers: [ListController],
    providers: [ListService],
})
export class ListModule {}
