import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { FirebaseAdminService } from "./firebase-admin.service";
import { AuthenticatedRequest, AuthenticatedUser } from "./auth-user.interface";

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        await this.authenticateRequest(request, false);
        return true;
    }

    protected async authenticateRequest(
        request: AuthenticatedRequest,
        optional: boolean,
    ): Promise<AuthenticatedUser | undefined> {
        const token = this.extractBearerToken(request.headers.authorization);

        if (!token) {
            if (optional) {
                return undefined;
            }

            throw new UnauthorizedException("Missing Authorization bearer token");
        }

        const decodedToken = await this.firebaseAdminService.verifyIdToken(token);
        request.user = decodedToken as AuthenticatedUser;

        return request.user;
    }

    protected extractBearerToken(authorizationHeader?: string | string[]): string | null {
        const headerValue = Array.isArray(authorizationHeader)
            ? authorizationHeader[0]
            : authorizationHeader;

        if (!headerValue) {
            return null;
        }

        const [scheme, token] = headerValue.split(" ");
        if (scheme?.toLowerCase() !== "bearer" || !token) {
            return null;
        }

        return token;
    }
}
