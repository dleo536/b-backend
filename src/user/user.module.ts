import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UserFollow } from "./follow.entity";

@Module({
    imports: [TypeOrmModule.forFeature([User, UserFollow])],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
