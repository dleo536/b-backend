import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { FirebaseAdminService } from "./firebase-admin.service";

const mockVerifyIdToken = jest.fn();
const mockDeleteUser = jest.fn();
const mockGetAuth = jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
    deleteUser: mockDeleteUser,
}));
const mockInitializeApp = jest.fn(() => ({
    name: "test-app",
}));
const mockGetApps = jest.fn(() => []);
const mockCert = jest.fn((value) => value);

jest.mock("firebase-admin/app", () => ({
    cert: (...args: unknown[]) => mockCert(...args),
    getApps: () => mockGetApps(),
    initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
}));

jest.mock("firebase-admin/auth", () => ({
    getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

describe("FirebaseAdminService", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            FIREBASE_PROJECT_ID: "test-project-id",
            FIREBASE_CLIENT_EMAIL: "firebase-admin@example.com",
            FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n",
        };
        mockVerifyIdToken.mockReset();
        mockDeleteUser.mockReset();
        mockGetAuth.mockClear();
        mockInitializeApp.mockClear();
        mockGetApps.mockReset();
        mockGetApps.mockReturnValue([]);
        mockCert.mockClear();
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.clearAllMocks();
    });

    it("checks Firebase token revocation during verification", async () => {
        const decodedToken = { uid: "firebase-uid-1" };
        mockVerifyIdToken.mockResolvedValue(decodedToken);

        const service = new FirebaseAdminService();
        const result = await service.verifyIdToken("token-123");

        expect(result).toBe(decodedToken);
        expect(mockVerifyIdToken).toHaveBeenCalledWith("token-123", true);
    });

    it("rejects revoked Firebase sessions", async () => {
        mockVerifyIdToken.mockRejectedValue({
            code: "auth/id-token-revoked",
        });

        const service = new FirebaseAdminService();
        const verificationPromise = service.verifyIdToken("token-123");

        await expect(verificationPromise).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(verificationPromise).rejects.toThrow(
            "Firebase session has been revoked. Please sign in again.",
        );
    });

    it("deletes a Firebase user by uid", async () => {
        mockDeleteUser.mockResolvedValue(undefined);

        const service = new FirebaseAdminService();
        await service.deleteUser("firebase-uid-1");

        expect(mockDeleteUser).toHaveBeenCalledWith("firebase-uid-1");
    });

    it("ignores Firebase user deletion when the account is already gone", async () => {
        mockDeleteUser.mockRejectedValue({
            code: "auth/user-not-found",
        });

        const service = new FirebaseAdminService();

        await expect(service.deleteUser("firebase-uid-1")).resolves.toBeUndefined();
    });

    it("throws when Firebase user deletion fails unexpectedly", async () => {
        mockDeleteUser.mockRejectedValue({
            code: "auth/internal-error",
        });

        const service = new FirebaseAdminService();

        await expect(service.deleteUser("firebase-uid-1")).rejects.toBeInstanceOf(
            InternalServerErrorException,
        );
    });
});
