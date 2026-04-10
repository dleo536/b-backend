import { Injectable, InternalServerErrorException, Logger, UnauthorizedException } from "@nestjs/common";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { DecodedIdToken, getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

type StorageObjectReference = {
    bucketName: string;
    objectPath: string;
};

@Injectable()
export class FirebaseAdminService {
    private readonly logger = new Logger(FirebaseAdminService.name);
    private readonly app: App | null;
    private readonly configurationError: string | null;

    constructor() {
        const { app, configurationError } = this.initializeFirebaseApp();
        this.app = app;
        this.configurationError = configurationError;
    }

    async verifyIdToken(token: string): Promise<DecodedIdToken> {
        const authApp = this.getInitializedApp();

        try {
            return await getAuth(authApp).verifyIdToken(token, true);
        } catch (error) {
            const authErrorCode =
                typeof error === "object" && error !== null && "code" in error
                    ? String((error as { code?: unknown }).code ?? "")
                    : "";

            if (authErrorCode === "auth/id-token-revoked") {
                this.logger.warn("Firebase ID token was revoked");
                throw new UnauthorizedException("Firebase session has been revoked. Please sign in again.");
            }

            if (authErrorCode === "auth/user-disabled") {
                this.logger.warn("Firebase user account is disabled");
                throw new UnauthorizedException("Firebase account is disabled");
            }

            this.logger.warn("Firebase ID token verification failed");
            throw new UnauthorizedException("Invalid or expired Firebase ID token");
        }
    }

    async deleteUser(uid: string): Promise<void> {
        const authApp = this.getInitializedApp();

        try {
            await getAuth(authApp).deleteUser(uid);
        } catch (error) {
            const authErrorCode =
                typeof error === "object" && error !== null && "code" in error
                    ? String((error as { code?: unknown }).code ?? "")
                    : "";

            if (authErrorCode === "auth/user-not-found") {
                this.logger.warn(`Firebase user ${uid} was already deleted`);
                return;
            }

            this.logger.error(`Failed to delete Firebase user ${uid}`);
            throw new InternalServerErrorException("Could not delete Firebase account");
        }
    }

    async deleteProfileImage(uid: string, avatarUrl?: string | null): Promise<void> {
        const normalizedUid = typeof uid === "string" ? uid.trim() : "";
        if (!normalizedUid) {
            return;
        }

        const storageTargets = this.getProfileImageStorageTargets(normalizedUid, avatarUrl);
        if (storageTargets.length === 0) {
            return;
        }

        const storage = getStorage(this.getInitializedApp());

        for (const storageTarget of storageTargets) {
            try {
                await storage
                    .bucket(storageTarget.bucketName)
                    .file(storageTarget.objectPath)
                    .delete({ ignoreNotFound: true });
            } catch (error) {
                this.logger.error(
                    `Failed to delete profile image ${storageTarget.objectPath} from ${storageTarget.bucketName} for Firebase user ${normalizedUid}`,
                );
                throw new InternalServerErrorException("Could not delete stored profile image");
            }
        }
    }

    private getInitializedApp(): App {
        if (!this.app) {
            throw new InternalServerErrorException(
                this.configurationError ??
                    "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
            );
        }

        return this.app;
    }

    private initializeFirebaseApp(): { app: App | null; configurationError: string | null } {
        const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        const storageBucket =
            process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
            (projectId ? `${projectId}.firebasestorage.app` : undefined);

        if (!projectId || !clientEmail || !privateKey) {
            return {
                app: null,
                configurationError:
                    "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
            };
        }

        try {
            const existingApp = getApps()[0];
            if (existingApp) {
                return { app: existingApp, configurationError: null };
            }

            const app = initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
                storageBucket,
            });

            return { app, configurationError: null };
        } catch (error) {
            this.logger.error("Failed to initialize Firebase Admin SDK");
            return {
                app: null,
                configurationError:
                    "Firebase Admin credentials could not be initialized. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
            };
        }
    }

    private getProfileImageStorageTargets(
        uid: string,
        avatarUrl?: string | null,
    ): StorageObjectReference[] {
        const storageTargets = new Map<string, StorageObjectReference>();
        const configuredStorageBucket = this.getConfiguredStorageBucket();

        if (configuredStorageBucket) {
            const defaultProfileImagePath = `profileImages/${uid}`;
            storageTargets.set(
                `${configuredStorageBucket}/${defaultProfileImagePath}`,
                {
                    bucketName: configuredStorageBucket,
                    objectPath: defaultProfileImagePath,
                },
            );
        }

        const avatarStorageReference = this.parseStorageObjectReference(avatarUrl);
        if (avatarStorageReference) {
            storageTargets.set(
                `${avatarStorageReference.bucketName}/${avatarStorageReference.objectPath}`,
                avatarStorageReference,
            );
        }

        return Array.from(storageTargets.values());
    }

    private getConfiguredStorageBucket(): string | null {
        const configuredBucket = this.app?.options.storageBucket;
        if (typeof configuredBucket !== "string") {
            return null;
        }

        const normalizedBucket = configuredBucket.trim();
        return normalizedBucket.length > 0 ? normalizedBucket : null;
    }

    private parseStorageObjectReference(value?: string | null): StorageObjectReference | null {
        if (typeof value !== "string") {
            return null;
        }

        const normalizedValue = value.trim();
        if (!normalizedValue) {
            return null;
        }

        if (normalizedValue.startsWith("gs://")) {
            const withoutScheme = normalizedValue.slice("gs://".length);
            const [bucketName, ...pathParts] = withoutScheme.split("/");
            const objectPath = decodeURIComponent(pathParts.join("/"));

            if (!bucketName || !objectPath) {
                return null;
            }

            return { bucketName, objectPath };
        }

        try {
            const parsedUrl = new URL(normalizedValue);

            if (parsedUrl.hostname === "firebasestorage.googleapis.com") {
                const firebaseStorageMatch = parsedUrl.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
                if (!firebaseStorageMatch) {
                    return null;
                }

                const [, bucketName, encodedObjectPath] = firebaseStorageMatch;
                return {
                    bucketName: decodeURIComponent(bucketName),
                    objectPath: decodeURIComponent(encodedObjectPath),
                };
            }

            if (parsedUrl.hostname === "storage.googleapis.com") {
                const pathSegments = parsedUrl.pathname
                    .split("/")
                    .filter((segment) => segment.length > 0);

                if (pathSegments.length < 2) {
                    return null;
                }

                const [bucketName, ...objectPathSegments] = pathSegments;
                return {
                    bucketName: decodeURIComponent(bucketName),
                    objectPath: decodeURIComponent(objectPathSegments.join("/")),
                };
            }
        } catch (error) {
            return null;
        }

        return null;
    }
}
