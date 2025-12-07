import { string } from "zod"
import { generateToken } from "../utils/jwt-util"

export interface UserJWTPayload {
    id: number
    username: string
    email: string
}

export interface RegisterUserRequest {
    username: string
    email: string
    password: string
}

export interface LoginUserRequest {
    email: string
    password: string
}

export interface UserResponse {
    token?: string
}

export function toUserResponse(
    id: number,
    username: string,
    email: string
): UserResponse {
    return {
        token: generateToken(
            {
                id: id,
                username: username,
                email: email,
            },
            "1h"
        ),
    }
}
