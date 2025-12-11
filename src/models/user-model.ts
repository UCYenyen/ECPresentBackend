import { string } from "zod";
import { generateToken } from "../utils/jwt-util";
import { Request } from "express";

export interface UserJWTPayload {
  id: number;
  username: string;
  email: string;
  isGuest?: boolean;
  avatar_id: number;
  image_url?: string;
}
export interface RegisterUserRequest {
  userId?: number;
  username: string;
  email: string;
  password: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  image_url?: string;
  password?: string;
  avatar_id: number;
}

export interface LoginUserRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  token?: string;
}

export interface UserRequest extends Request {
  user?: UserJWTPayload;
}

export interface AvatarResponse {
  id: number;
  image_url: string;
}
export interface CreateAvatarRequest {
    file?: Express.Multer.File;
}

export interface UpdateAvatarRequest {
    id: number;
    file?: Express.Multer.File;
}
export function toUserResponse(
  id: number,
  username: string,
  email: string,
  avatar_id: number,
  image_url?: string,
  isGuest?: boolean
): UserResponse {
  return {
    token: generateToken(
      {
        id: id,
        username: username,
        email: email,
        isGuest: isGuest,
        image_url: image_url,
        avatar_id: avatar_id,
      },
      isGuest ? "7d" : "24h" // Guest token 7 hari, user biasa 24 jam
    ),
  };
}
