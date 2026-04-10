import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ModerationService } from "./moderation.service";
import { UpdateReportStatusDto } from "./dto/update-report-status.dto";

@Controller("admin/reports")
@UseGuards(FirebaseAuthGuard, AdminGuard)
export class AdminReportController {
    constructor(private readonly moderationService: ModerationService) {}

    @Get()
    findAll(@Query("status") status?: string) {
        return this.moderationService.listReports(status);
    }

    @Patch(":id")
    updateStatus(
        @Param("id") id: string,
        @Body() updateReportStatusDto: UpdateReportStatusDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.moderationService.updateReportStatus(
            id,
            currentUser.uid,
            updateReportStatusDto,
        );
    }
}
