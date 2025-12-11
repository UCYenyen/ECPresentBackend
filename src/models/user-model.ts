import { string } from "zod"
import { generateToken } from "../utils/jwt-util"
import { Request } from "express";

export interface UserJWTPayload {
    id: number
    username: string
    email: string
    isGuest?: boolean
}
export interface RegisterUserRequest {
    username: string
    email: string
    password: string
}

export interface UpdateUserRequest {
    username?: string
    email?: string
    password?: string
}
export interface LoginUserRequest {
    email: string
    password: string
}

export interface UserResponse {
    token?: string
}

export interface UserRequest extends Request {
    user?: UserJWTPayload
}

export function toUserResponse(
    id: number,
    username: string,
    email: string,
    isGuest?: boolean
): UserResponse {
    return {
        token: generateToken(
            {
                id: id,
                username: username,
                email: email,
                isGuest: isGuest,
            },
            isGuest ? "7d" : "24h" // Guest token 7 hari, user biasa 24 jam
        ),
    }
}
