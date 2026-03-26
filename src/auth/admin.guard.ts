import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { AuthenticatedRequest } from "./auth-user.interface";

@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const currentUser = request.user;

        if (!currentUser) {
            throw new UnauthorizedException("Authentication is required");
        }

        if (!currentUser.isAdmin) {
            throw new ForbiddenException("Admin access required");
        }

        return true;
    }
}
