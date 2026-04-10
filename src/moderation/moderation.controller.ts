import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ModerationService } from "./moderation.service";
import { CreateReportDto } from "./dto/create-report.dto";

@Controller("reports")
@UseGuards(FirebaseAuthGuard)
export class ModerationController {
    constructor(private readonly moderationService: ModerationService) {}

    @Post()
    create(
        @Body() createReportDto: CreateReportDto,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        return this.moderationService.createReport(currentUser.uid, createReportDto);
    }
}
