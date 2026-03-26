import { Controller, Delete, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ListService } from "./list.service";

@Controller("admin/lists")
@UseGuards(FirebaseAuthGuard, AdminGuard)
export class AdminListController {
    constructor(private readonly listService: ListService) {}

    @Delete(":id")
    async remove(
        @Param("id") id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        const deletedList = await this.listService.removeAsAdmin(id, currentUser.uid);

        return {
            success: true,
            id: deletedList.id,
            deleted: true,
        };
    }
}
