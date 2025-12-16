import { string } from "zod";
import { generateToken } from "../utils/jwt-util";
import { Request } from "express";
import { Avatar, UserRole } from "@prisma/client";

export interface UserJWTPayload {
  id: number;
  username: string;
  email: string;
  role?: UserRole;
  avatar?: Avatar;
  image_url?: string;
}
export interface RegisterUserRequest {
  user_id?: number;
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
  image_url?: string,
  role?: UserRole,
  avatar?: Avatar 
): UserResponse {
  return {
    token: generateToken(
      {
        id: id,
        username: username,
        email: email,
        role: role,
        image_url: image_url,
        avatar: avatar,
      },
      role === UserRole.GUEST ? "30d" : "24h"
    ),
  };
}
