import { Request } from "express";
import { UserJWTPayload } from "./user-model";

export interface UserRequest extends Request {
    user?: UserJWTPayload
}