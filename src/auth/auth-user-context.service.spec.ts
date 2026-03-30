import { ForbiddenException } from "@nestjs/common";
import { Repository } from "typeorm";
import { AuthUserContextService } from "./auth-user-context.service";
import { User, UserRole } from "../user/user.entity";

describe("AuthUserContextService", () => {
    let userRepository: Pick<Repository<User>, "findOne">;
    let service: AuthUserContextService;

    beforeEach(() => {
        userRepository = {
            findOne: jest.fn(),
        };
        service = new AuthUserContextService(userRepository as Repository<User>);
    });

    it("builds the authenticated user for active profiles", async () => {
        (userRepository.findOne as jest.Mock).mockResolvedValue({
            id: "app-user-1",
            roles: [UserRole.ADMIN],
            isSuspended: false,
        } as Partial<User>);

        const result = await service.buildAuthenticatedUser({
            uid: "firebase-uid-1",
        } as any);

        expect(result.uid).toBe("firebase-uid-1");
        expect(result.appUserId).toBe("app-user-1");
        expect(result.roles).toEqual([UserRole.ADMIN]);
        expect(result.isAdmin).toBe(true);
    });

    it("defaults to the user role when no app profile exists yet", async () => {
        (userRepository.findOne as jest.Mock).mockResolvedValue(null);

        const result = await service.buildAuthenticatedUser({
            uid: "firebase-uid-1",
        } as any);

        expect(result.appUserId).toBeUndefined();
        expect(result.roles).toEqual([UserRole.USER]);
        expect(result.isAdmin).toBe(false);
    });

    it("rejects suspended authenticated users", async () => {
        (userRepository.findOne as jest.Mock).mockResolvedValue({
            id: "app-user-1",
            roles: [UserRole.USER],
            isSuspended: true,
            suspendReason: "Repeated abuse",
        } as Partial<User>);

        const buildUserPromise = service.buildAuthenticatedUser({
            uid: "firebase-uid-1",
        } as any);

        await expect(buildUserPromise).rejects.toBeInstanceOf(ForbiddenException);
        await expect(buildUserPromise).rejects.toThrow(
            "Your account has been suspended: Repeated abuse",
        );
    });

    it("rejects suspended admins before allowing admin actions", async () => {
        (userRepository.findOne as jest.Mock).mockResolvedValue({
            id: "app-user-1",
            roles: [UserRole.ADMIN],
            isSuspended: true,
        } as Partial<User>);

        const adminCheckPromise = service.requireAdminByOauthId("firebase-uid-1");

        await expect(adminCheckPromise).rejects.toBeInstanceOf(ForbiddenException);
        await expect(adminCheckPromise).rejects.toThrow(
            "Your account has been suspended",
        );
    });
});
