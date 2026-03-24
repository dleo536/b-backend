import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @UseGuards(FirebaseAuthGuard)
    @Post()
    create(
        @Body() createUserDto: CreateUserDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.create(createUserDto, currentUser.uid);
    }

    @Get('availability')
    checkAvailability(
        @Query('username') username?: string,
        @Query('email') email?: string,
    ) {
        return this.userService.checkAvailability(username, email);
    }

    @Get()
    findAll(
        @Query('p') page?: string,
        @Query('username') username?: string,
        @Query('oauthId') oauthId?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
    ) {
        if (oauthId) {
            return this.userService.findByOauthId(oauthId);
        }

        // Handle the duplicate route - if username is provided with offset/limit, use findByUsername
        if (username && (offset !== undefined || limit !== undefined)) {
            const offsetNum = offset ? parseInt(offset) : 0;
            const limitNum = limit ? parseInt(limit) : 10;
            return this.userService.findByUsername(username, offsetNum, limitNum);
        }

        // Otherwise use the paginated findAll
        const pageNum = page ? parseInt(page) : 0;
        const usersPerPage = 4;
        return this.userService.findAll(pageNum, usersPerPage, username);
    }

    @UseGuards(FirebaseAuthGuard)
    @Get("me")
    getMe(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.userService.findByOauthIdOrThrow(currentUser.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Post(':id/follow')
    followUser(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.followUser(currentUser.uid, id);
    }

    @UseGuards(FirebaseAuthGuard)
    @Delete(':id/follow')
    unfollowUser(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.unfollowUser(currentUser.uid, id);
    }

    @UseGuards(FirebaseAuthGuard)
    @Get('me/following')
    getMyFollowing(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.userService.getFollowingByIdentifier(currentUser.uid);
    }

    @Get(':id/following')
    getFollowing(@Param('id') id: string) {
        return this.userService.getFollowingByIdentifier(id);
    }

    @UseGuards(FirebaseAuthGuard)
    @Get(':id/is-following')
    isFollowing(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.isFollowing(currentUser.uid, id);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.userService.findOne(id);
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch('me')
    updateMe(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        return this.userService.updateCurrentUser(currentUser.uid, updateUserDto);
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch(':uid')
    update(
        @Param('uid') uid: string,
        @Body() updateUserDto: UpdateUserDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.update(uid, updateUserDto, currentUser.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Delete("me")
    removeMe(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.userService.removeCurrentUser(currentUser.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Delete(':id')
    remove(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.remove(id, currentUser.uid);
    }
}
