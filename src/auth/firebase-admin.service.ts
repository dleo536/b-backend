import { Injectable, InternalServerErrorException, Logger, UnauthorizedException } from "@nestjs/common";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { DecodedIdToken, getAuth } from "firebase-admin/auth";

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
            return await getAuth(authApp).verifyIdToken(token);
        } catch (error) {
            this.logger.warn("Firebase ID token verification failed");
            throw new UnauthorizedException("Invalid or expired Firebase ID token");
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
}
