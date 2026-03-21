import { Controller, Post, Body, Get, Param, Patch, Delete, Query } from "@nestjs/common";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post()
    create(@Body() createUserDto: CreateUserDto) {
        return this.userService.create(createUserDto);
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

    @Post(':id/follow')
    followUser(
        @Param('id') id: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.userService.followUser(viewerId ?? viewerUid ?? '', id);
    }

    @Delete(':id/follow')
    unfollowUser(
        @Param('id') id: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.userService.unfollowUser(viewerId ?? viewerUid ?? '', id);
    }

    @Get('me/following')
    getMyFollowing(
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.userService.getFollowingByIdentifier(viewerId ?? viewerUid ?? '');
    }

    @Get(':id/following')
    getFollowing(@Param('id') id: string) {
        return this.userService.getFollowingByIdentifier(id);
    }

    @Get(':id/is-following')
    isFollowing(
        @Param('id') id: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.userService.isFollowing(viewerId ?? viewerUid ?? '', id);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.userService.findOne(id);
    }

    @Patch(':uid')
    update(@Param('uid') uid: string, @Body() updateUserDto: UpdateUserDto) {
        return this.userService.update(uid, updateUserDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.userService.remove(id);
    }
}
