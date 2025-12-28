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
  id?: number;          // Add this
  username?: string;    // Add this
  email?: string;       // Add this
  role?: UserRole;        // Add this (or UserRole if you have that enum imported)
  image_url?: string;   // Add this
  avatar?: Avatar;      // Add this
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
  role?: UserRole,
  avatar?: Avatar 
): UserResponse {
  let final_image_url = "uploads/avatar_2.jpg";
  if (avatar && avatar.image_url) {
    final_image_url = avatar.image_url.replace("../", "");
  }
  const token = generateToken(
    {
      id: id,
      username: username,
      email: email,
      role: role,
      image_url: final_image_url,
      avatar: avatar,
    },
    role === UserRole.GUEST ? "30d" : "24h"
  );
  
  return {
    id: id,
    username: username,
    email: email,
    role: role,
    image_url: final_image_url,
    avatar: avatar,
    token: token,
  };
}
