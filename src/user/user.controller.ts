import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CheckAvailabilityDto } from "./dto/check-availability.dto";
import {
    toPublicUserResponse,
    toPublicUserResponses,
    toSelfUserResponse,
} from "./user-response";

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

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @UseGuards(FirebaseAuthGuard)
    @Post()
    create(
        @Body() createUserDto: CreateUserDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService
            .create(createUserDto, currentUser.uid)
            .then((user) => toSelfUserResponse(user));
    }

    @Post('availability')
    checkAvailability(
        @Body() checkAvailabilityDto: CheckAvailabilityDto,
    ) {
        return this.userService.checkAvailability(
            checkAvailabilityDto.username,
            checkAvailabilityDto.email,
        );
    }

    @Get()
    findAll(
        @Query('p') page?: string,
        @Query('username') username?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
    ) {
        // Handle the duplicate route - if username is provided with offset/limit, use findByUsername
        if (username && (offset !== undefined || limit !== undefined)) {
            const offsetNum = parseNonNegativeInt(offset, 0, 100);
            const limitNum = parseNonNegativeInt(limit, 10, 100);
            return this.userService
                .findByUsername(username, offsetNum, limitNum)
                .then((users) => toPublicUserResponses(users));
        }

        // Otherwise use the paginated findAll
        const pageNum = parseNonNegativeInt(page, 0, 1000);
        const usersPerPage = 4;
        return this.userService
            .findAll(pageNum, usersPerPage, username)
            .then((users) => toPublicUserResponses(users));
    }

    @UseGuards(FirebaseAuthGuard)
    @Get("me")
    getMe(@CurrentUser() currentUser: AuthenticatedUser) {
        return this.userService
            .findByOauthIdOrThrow(currentUser.uid)
            .then((user) => toSelfUserResponse(user));
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
        return this.userService.getFollowingByIdentifier(currentUser.uid).then((result) => ({
            ...result,
            following: toPublicUserResponses(result.following),
        }));
    }

    @Get(':id/following')
    getFollowing(@Param('id') id: string) {
        return this.userService.getFollowingByIdentifier(id).then((result) => ({
            ...result,
            following: toPublicUserResponses(result.following),
        }));
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
        return this.userService.findOne(id).then((user) => toPublicUserResponse(user));
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch('me')
    updateMe(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        return this.userService
            .updateCurrentUser(currentUser.uid, updateUserDto)
            .then((result) => ({
                ...result,
                user: toSelfUserResponse(result.user),
            }));
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch(':uid')
    update(
        @Param('uid') uid: string,
        @Body() updateUserDto: UpdateUserDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.userService.update(uid, updateUserDto, currentUser.uid).then((result) => ({
            ...result,
            user: toSelfUserResponse(result.user),
        }));
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
