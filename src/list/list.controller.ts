import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { OptionalFirebaseAuthGuard } from "../auth/optional-firebase-auth.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ListService } from "./list.service";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";
import { toListResponse, toListResponses } from "./list-response";

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

@Controller('lists')
export class ListController {
    constructor(private readonly listService: ListService) {}

    @UseGuards(FirebaseAuthGuard)
    @Post()
    create(
        @Body() createListDto: CreateListDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService
            .create(createListDto, currentUser.uid)
            .then((list) => toListResponse(list));
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
        const offsetNum = parseNonNegativeInt(offset, 0, 200);
        const limitNum = parseNonNegativeInt(limit, 10, 200);
        const resolvedUserId = userID ?? userId;
        return this.listService.findAll(
            resolvedUserId,
            offsetNum,
            limitNum,
            currentUser?.uid,
            title,
            albumId,
        ).then((result) => ({
            ...result,
            data: toListResponses(result.data),
        }));
    }

    @UseGuards(FirebaseAuthGuard)
    @Get('me/liked')
    getLikedLists(
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        const offsetNum = parseNonNegativeInt(offset, 0, 200);
        const limitNum = parseNonNegativeInt(limit, 50, 200);
        return this.listService.getLikedLists(currentUser?.uid ?? '', offsetNum, limitNum).then((result) => ({
            ...result,
            data: toListResponses(result.data),
        }));
    }

    @UseGuards(OptionalFirebaseAuthGuard)
    @Get('detail/:id')
    getDetail(
        @Param('id') id: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        return this.listService
            .findOne(id, currentUser?.uid)
            .then((list) => toListResponse(list));
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

    @UseGuards(OptionalFirebaseAuthGuard)
    @Get(':id')
    findOne(
        @Param('id') id: string,
        @CurrentUser() currentUser?: AuthenticatedUser,
    ) {
        // Note: In Express, this route finds lists by userID, not list id
        // Implementing it to find by userID to match Express behavior
        return this.listService
            .findByUserId(id, currentUser?.uid)
            .then((lists) => toListResponses(lists));
    }

    @UseGuards(FirebaseAuthGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateListDto: UpdateListDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.listService
            .update(id, updateListDto, currentUser.uid)
            .then((list) => toListResponse(list));
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
