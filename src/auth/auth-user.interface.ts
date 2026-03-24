import { DecodedIdToken } from "firebase-admin/auth";
import { Request } from "express";

export interface AuthenticatedUser extends DecodedIdToken {
    uid: string;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}
