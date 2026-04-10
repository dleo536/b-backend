import { UserController } from "./user.controller";

describe("UserController account deletion", () => {
    it("deletes the stored avatar from the backend before removing the user", async () => {
        const userService = {
            findByOauthIdOrThrow: jest.fn().mockResolvedValue({
                id: "backend-user-id",
                avatarUrl:
                    "https://firebasestorage.googleapis.com/v0/b/b-sides-9cb91.firebasestorage.app/o/profileImages%2Ffirebase-uid-1?alt=media",
            }),
            removeCurrentUser: jest.fn().mockResolvedValue(undefined),
        };
        const firebaseAdminService = {
            deleteProfileImage: jest.fn().mockResolvedValue(undefined),
            deleteUser: jest.fn().mockResolvedValue(undefined),
        };
        const moderationService = {} as any;
        const controller = new UserController(
            userService as any,
            firebaseAdminService as any,
            moderationService,
        );

        const result = await controller.removeMe({ uid: "firebase-uid-1" } as any);

        expect(firebaseAdminService.deleteProfileImage).toHaveBeenCalledWith(
            "firebase-uid-1",
            "https://firebasestorage.googleapis.com/v0/b/b-sides-9cb91.firebasestorage.app/o/profileImages%2Ffirebase-uid-1?alt=media",
        );
        expect(userService.removeCurrentUser).toHaveBeenCalledWith("firebase-uid-1");
        expect(firebaseAdminService.deleteUser).toHaveBeenCalledWith("firebase-uid-1");
        expect(
            firebaseAdminService.deleteProfileImage.mock.invocationCallOrder[0],
        ).toBeLessThan(userService.removeCurrentUser.mock.invocationCallOrder[0]);
        expect(userService.removeCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(
            firebaseAdminService.deleteUser.mock.invocationCallOrder[0],
        );
        expect(result).toEqual({
            message: "Account deleted successfully",
            id: "backend-user-id",
        });
    });
});
