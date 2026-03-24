import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { OptionalFirebaseAuthGuard } from "../auth/optional-firebase-auth.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ListService } from "./list.service";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";

@Controller('lists')
export class ListController {
    private readonly logger = new Logger(ListController.name);

    constructor(private readonly listService: ListService) {}

    @UseGuards(FirebaseAuthGuard)
    @Post()
    create(
        @Body() createListDto: CreateListDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService.create(createListDto, currentUser.uid);
    }

    @UseGuards(OptionalFirebaseAuthGuard)
    @Get()
    findAll(
        @Query('userID') userID?: string,
        @Query('userId') userId?: string,
        @Query('title') title?: string,
        @Query('albumId') albumId?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        const offsetNum = offset ? parseInt(offset) : 0;
        const limitNum = limit ? parseInt(limit) : 10;
        const resolvedUserId = userID ?? userId;
        this.logger.log(
            `[GET /lists] userID=${resolvedUserId ?? "none"} title=${title ?? "none"} albumId=${albumId ?? "none"} offset=${offsetNum} limit=${limitNum}`,
        );
        return this.listService.findAll(
            resolvedUserId,
            offsetNum,
            limitNum,
            currentUser?.uid,
            title,
            albumId,
        );
    }

    @UseGuards(FirebaseAuthGuard)
    @Get('me/liked')
    getLikedLists(
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        const offsetNum = offset ? parseInt(offset) : 0;
        const limitNum = limit ? parseInt(limit) : 50;
        return this.listService.getLikedLists(currentUser?.uid ?? '', offsetNum, limitNum);
    }

    @Get('detail/:id')
    getDetail(@Param('id') id: string) {
        return this.listService.findOne(id);
    }

    @UseGuards(FirebaseAuthGuard)
    @Post(':id/like')
    likeList(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService.likeList(id, currentUser.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Delete(':id/like')
    unlikeList(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService.unlikeList(id, currentUser.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Get(':id/is-liked')
    isLiked(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService.isListLiked(id, currentUser.uid);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        // Note: In Express, this route finds lists by userID, not list id
        // Implementing it to find by userID to match Express behavior
        return this.listService.findByUserId(id);
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateListDto: UpdateListDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService.update(id, updateListDto, currentUser.uid);
    }

    @UseGuards(FirebaseAuthGuard)
    @Delete(':id')
    remove(
        @Param('id') id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService.remove(id, currentUser.uid);
    }
}
