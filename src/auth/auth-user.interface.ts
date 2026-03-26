import { DecodedIdToken } from "firebase-admin/auth";
import { Request } from "express";
import { UserRole } from "../user/user.entity";

export interface AuthenticatedUser extends DecodedIdToken {
    uid: string;
    appUserId?: string;
    roles: UserRole[];
    isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}
