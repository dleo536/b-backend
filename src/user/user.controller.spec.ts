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

describe("UserController change password", () => {
    it("updates the authenticated user's Firebase password", async () => {
        const userService = {
            findByOauthIdOrThrow: jest.fn().mockResolvedValue({
                id: "backend-user-id",
            }),
        };
        const firebaseAdminService = {
            updateUserPassword: jest.fn().mockResolvedValue(undefined),
        };
        const moderationService = {} as any;
        const controller = new UserController(
            userService as any,
            firebaseAdminService as any,
            moderationService,
        );

        const result = await controller.changeMyPassword(
            { uid: "firebase-uid-1" } as any,
            { newPassword: "NewPassword1" },
        );

        expect(userService.findByOauthIdOrThrow).toHaveBeenCalledWith("firebase-uid-1");
        expect(firebaseAdminService.updateUserPassword).toHaveBeenCalledWith(
            "firebase-uid-1",
            "NewPassword1",
        );
        expect(result).toEqual({
            message: "Password updated successfully",
        });
    });
});

describe("UserController onboarding details", () => {
    it("updates the authenticated user's onboarding details", async () => {
        const userService = {
            updateOnboardingDetails: jest.fn().mockResolvedValue({
                message: "Onboarding details updated successfully",
                user: {
                    id: "backend-user-id",
                    username: "listener",
                    displayName: null,
                    bio: "Hi, I like local shows.",
                    avatarUrl: null,
                    bannerUrl: null,
                    location: null,
                    websiteUrl: null,
                    favoriteGenres: [],
                    favoriteArtists: [],
                    followersCount: 0,
                    followingCount: 0,
                    reviewsCount: 0,
                    likesReceivedCount: 0,
                    createdAt: new Date("2026-05-01T00:00:00.000Z"),
                    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
                    email: "listener@example.com",
                    dateOfBirth: "2000-01-15",
                    country: "United States",
                    city: "Chicago",
                },
            }),
        };
        const firebaseAdminService = {} as any;
        const moderationService = {} as any;
        const controller = new UserController(
            userService as any,
            firebaseAdminService as any,
            moderationService,
        );

        const result = await controller.updateMyOnboardingDetails(
            { uid: "firebase-uid-1" } as any,
            {
                dateOfBirth: "2000-01-15",
                country: "United States",
                city: "Chicago",
                bio: "Hi, I like local shows.",
            },
        );

        expect(userService.updateOnboardingDetails).toHaveBeenCalledWith(
            "firebase-uid-1",
            {
                dateOfBirth: "2000-01-15",
                country: "United States",
                city: "Chicago",
                bio: "Hi, I like local shows.",
            },
        );
        expect(result).toEqual({
            message: "Onboarding details updated successfully",
            user: expect.objectContaining({
                id: "backend-user-id",
                dateOfBirth: "2000-01-15",
                country: "United States",
                city: "Chicago",
            }),
        });
    });
});
