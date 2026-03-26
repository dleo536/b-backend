import { Controller, Delete, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import type { AuthenticatedUser } from "../auth/auth-user.interface";
import { ReviewService } from "./review.service";

@Controller("admin/reviews")
@UseGuards(FirebaseAuthGuard, AdminGuard)
export class AdminReviewController {
    constructor(private readonly reviewService: ReviewService) {}

    @Delete(":id")
    async remove(
        @Param("id") id: string,
        @CurrentUser() currentUser: AuthenticatedUser,
    ) {
        const deletedReview = await this.reviewService.removeAsAdmin(
            id,
            currentUser.uid,
        );

        return {
            success: true,
            id: deletedReview.id,
            deleted: true,
        };
    }
}
