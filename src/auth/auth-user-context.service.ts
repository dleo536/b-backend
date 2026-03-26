import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DecodedIdToken } from "firebase-admin/auth";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "./auth-user.interface";
import { User, UserRole } from "../user/user.entity";

@Injectable()
export class AuthUserContextService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    private normalizeRoles(roles?: User["roles"]): UserRole[] {
        if (!Array.isArray(roles) || roles.length === 0) {
            return [UserRole.USER];
        }

        return Array.from(new Set(roles));
    }

    async buildAuthenticatedUser(
        decodedToken: DecodedIdToken,
    ): Promise<AuthenticatedUser> {
        const appUser = await this.userRepository.findOne({
            where: { oauthId: decodedToken.uid },
        });
        const roles = this.normalizeRoles(appUser?.roles);

        return {
            ...(decodedToken as AuthenticatedUser),
            uid: decodedToken.uid,
            appUserId: appUser?.id,
            roles,
            isAdmin: roles.includes(UserRole.ADMIN),
        };
    }

    async requireAdminByOauthId(oauthId: string): Promise<User> {
        const user = await this.userRepository.findOne({
            where: { oauthId },
        });

        if (!user) {
            throw new NotFoundException("Authenticated user profile not found");
        }

        const roles = this.normalizeRoles(user.roles);
        if (!roles.includes(UserRole.ADMIN)) {
            throw new ForbiddenException("Admin access required");
        }

        return user;
    }
}
