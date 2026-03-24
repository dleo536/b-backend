import { ExecutionContext, Injectable } from "@nestjs/common";
import { FirebaseAuthGuard } from "./firebase-auth.guard";
import { AuthenticatedRequest } from "./auth-user.interface";

@Injectable()
export class OptionalFirebaseAuthGuard extends FirebaseAuthGuard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        await this.authenticateRequest(request, true);
        return true;
    }
}
