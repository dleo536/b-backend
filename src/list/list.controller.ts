import { Controller, Post, Body, Get, Param, Patch, Delete, Query, Logger } from "@nestjs/common";
import { ListService } from "./list.service";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";

@Controller('lists')
export class ListController {
    private readonly logger = new Logger(ListController.name);

    constructor(private readonly listService: ListService) {}

    @Post()
    create(@Body() createListDto: CreateListDto) {
        return this.listService.create(createListDto);
    }

    @Get()
    findAll(
        @Query('userID') userID?: string,
        @Query('userId') userId?: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
    ) {
        const offsetNum = offset ? parseInt(offset) : 0;
        const limitNum = limit ? parseInt(limit) : 10;
        const resolvedUserId = userID ?? userId;
        const viewerIdentifier = viewerId ?? viewerUid;
        this.logger.log(
            `[GET /lists] userID=${resolvedUserId ?? "none"} viewer=${viewerIdentifier ?? "none"} offset=${offsetNum} limit=${limitNum}`,
        );
        return this.listService.findAll(resolvedUserId, offsetNum, limitNum, viewerIdentifier);
    }

    @Get('me/liked')
    getLikedLists(
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
    ) {
        const offsetNum = offset ? parseInt(offset) : 0;
        const limitNum = limit ? parseInt(limit) : 50;
        return this.listService.getLikedLists(viewerId ?? viewerUid ?? '', offsetNum, limitNum);
    }

    @Get('detail/:id')
    getDetail(@Param('id') id: string) {
        return this.listService.findOne(id);
    }

    @Post(':id/like')
    likeList(
        @Param('id') id: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.listService.likeList(id, viewerId ?? viewerUid ?? '');
    }

    @Delete(':id/like')
    unlikeList(
        @Param('id') id: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.listService.unlikeList(id, viewerId ?? viewerUid ?? '');
    }

    @Get(':id/is-liked')
    isLiked(
        @Param('id') id: string,
        @Query('viewerId') viewerId?: string,
        @Query('viewerUid') viewerUid?: string,
    ) {
        return this.listService.isListLiked(id, viewerId ?? viewerUid ?? '');
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        // Note: In Express, this route finds lists by userID, not list id
        // Implementing it to find by userID to match Express behavior
        return this.listService.findByUserId(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateListDto: UpdateListDto) {
        return this.listService.update(id, updateListDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.listService.remove(id);
    }
}
