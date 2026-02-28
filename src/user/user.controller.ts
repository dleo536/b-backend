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

    @Get()
    findAll(
        @Query('p') page?: string,
        @Query('username') username?: string,
        @Query('offset') offset?: string,
        @Query('limit') limit?: string,
    ) {
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
