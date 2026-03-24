import { Global, Module } from "@nestjs/common";
import { FirebaseAdminService } from "./firebase-admin.service";
import { FirebaseAuthGuard } from "./firebase-auth.guard";
import { OptionalFirebaseAuthGuard } from "./optional-firebase-auth.guard";

@Global()
@Module({
    providers: [FirebaseAdminService, FirebaseAuthGuard, OptionalFirebaseAuthGuard],
    exports: [FirebaseAdminService, FirebaseAuthGuard, OptionalFirebaseAuthGuard],
})
export class AuthModule {}
