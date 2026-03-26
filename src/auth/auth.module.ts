import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FirebaseAdminService } from "./firebase-admin.service";
import { FirebaseAuthGuard } from "./firebase-auth.guard";
import { OptionalFirebaseAuthGuard } from "./optional-firebase-auth.guard";
import { AuthUserContextService } from "./auth-user-context.service";
import { User } from "../user/user.entity";
import { AdminGuard } from "./admin.guard";

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([User])],
    providers: [
        FirebaseAdminService,
        AuthUserContextService,
        FirebaseAuthGuard,
        OptionalFirebaseAuthGuard,
        AdminGuard,
    ],
    exports: [
        FirebaseAdminService,
        AuthUserContextService,
        FirebaseAuthGuard,
        OptionalFirebaseAuthGuard,
        AdminGuard,
    ],
})
export class AuthModule {}
