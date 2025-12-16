import { Request } from "express";
import { UserRole } from "@prisma/client";
import { ResponseError } from "../error/response-error";
import {
  LoginUserRequest,
  RegisterUserRequest,
  toUserResponse,
  UpdateUserRequest,
  UserResponse,
} from "../models/user-model";
import { prismaClient } from "../utils/database-util";
import { UserValidation } from "../validations/user-validation";
import { Validation } from "../validations/validation";
import { AvatarService } from "./avatar-service";
import bcrypt from "bcrypt";

export class UserService {
  static async register(request: RegisterUserRequest): Promise<UserResponse> {
    const validatedData = Validation.validate(UserValidation.REGISTER, request);

    const emailExists = await prismaClient.user.findFirst({
      where: {
        email: validatedData.email,
      },
    });

    if (emailExists) {
      throw new ResponseError(400, "Email has already existed!");
    }

    validatedData.password = await bcrypt.hash(validatedData.password, 10);

    // Kalau dari guest, update user yang udah ada
    if (request.user_id) {
      const existingUser = await prismaClient.user.findUnique({
        where: { id: request.user_id },
      });

      if (!existingUser || existingUser.role !== UserRole.GUEST) {
        throw new ResponseError(400, "Invalid guest user!");
      }

      const user = await prismaClient.user.update({
        data: {
          username: validatedData.username,
          email: validatedData.email,
          password: validatedData.password,
          role: UserRole.USER,
        },
        where: {
          id: request.user_id,
        },
      });

      return toUserResponse(
        user.id,
        user.username,
        user.email,
        user.avatar_id,
        user.image_url,
        user.role
      );
    }

    // Kalau user baru, get random avatar
    const randomAvatarId = await AvatarService.getRandomAvatarId();
    const avatar = await AvatarService.get(randomAvatarId);

    const user = await prismaClient.user.create({
      data: {
        username: validatedData.username,
        email: validatedData.email,
        password: validatedData.password,
        avatar_id: randomAvatarId,
        image_url: avatar.image_url,
      },
    });

    return toUserResponse(
      user.id,
      user.username,
      user.email,
      user.avatar_id,
      user.image_url,
      user.role
    );
  }

  static async login(request: LoginUserRequest): Promise<UserResponse> {
    const validatedData = Validation.validate(UserValidation.LOGIN, request);

    const user = await prismaClient.user.findFirst({
      where: {
        email: validatedData.email,
      },
    });

    if (!user) {
      throw new ResponseError(400, "Invalid email or password!");
    }

    const passwordIsValid = await bcrypt.compare(
      validatedData.password,
      user.password
    );

    if (!passwordIsValid) {
      throw new ResponseError(400, "Invalid email or password!");
    }

    return toUserResponse(
      user.id,
      user.username,
      user.email,
      user.avatar_id,
      user.image_url,
      user.role
    );
  }

  static async guest(request: Request): Promise<UserResponse> {
    // Get random avatar untuk guest juga
    const randomAvatarId = await AvatarService.getRandomAvatarId();
    const avatar = await AvatarService.get(randomAvatarId);

    const user = await prismaClient.user.create({
      data: {
        username: `guest_${Date.now()}`,
        email: `guest_${Date.now()}@example.com`,
        password: await bcrypt.hash(`guest_password_${Date.now()}`, 10),
        avatar_id: randomAvatarId,
        image_url: avatar.image_url,
        role: UserRole.GUEST,
      },
    });

    return toUserResponse(
      user.id,
      user.username,
      user.email,
      user.avatar_id,
      user.image_url,
      user.role
    );
  }

  static async getUserById(user_id: number): Promise<UserResponse> {
    const user = await prismaClient.user.findUnique({
      where: { id: user_id },
      include: { avatar: true },
    });

    if (!user) {
      throw new ResponseError(404, "User not found");
    }

    return toUserResponse(
      user.id,
      user.username,
      user.email,
      user.avatar_id,
      user.image_url,
      user.role
    );
  }

  static async updateUserById(
    user_id: number,
    updateData: UpdateUserRequest
  ): Promise<UserResponse> {
    const validatedData = Validation.validate(UserValidation.UPDATE, updateData);

    const user = await prismaClient.user.findUnique({
      where: { id: user_id },
    });

    if (!user) {
      throw new ResponseError(404, "User not found");
    }

    // Hash password kalau ada update password
    if (validatedData.password) {
      validatedData.password = await bcrypt.hash(validatedData.password, 10);
    }

    // Kalau update avatar_id, update juga image_url nya
    let newImageUrl = user.image_url;
    if (validatedData.avatar_id && validatedData.avatar_id !== user.avatar_id) {
      const avatar = await AvatarService.get(validatedData.avatar_id);
      newImageUrl = avatar.image_url;
    }

    const updatedUser = await prismaClient.user.update({
      where: { id: user_id },
      data: {
        username: validatedData.username || user.username,
        email: validatedData.email || user.email,
        password: validatedData.password || user.password,
        avatar_id: validatedData.avatar_id || user.avatar_id,
        image_url: newImageUrl,
      },
    });

    return toUserResponse(
      updatedUser.id,
      updatedUser.username,
      updatedUser.email,
      updatedUser.avatar_id,
      updatedUser.image_url,
      updatedUser.role
    );
  }
}