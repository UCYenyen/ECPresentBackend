import { prismaClient } from "../utils/database-util";
import {
  AvatarResponse,
  CreateAvatarRequest,
  UpdateAvatarRequest,
} from "../models/user-model";
import { ResponseError } from "../error/response-error";
import { CloudinaryUtil } from "../utils/cloudinary-util";
import { AvatarValidation } from "../validations/avatar-validation";
import { Validation } from "../validations/validation";

export class AvatarService {
  // ==================== CRUD AVATAR (ADMIN) ====================

  static async create(request: CreateAvatarRequest): Promise<AvatarResponse> {
    if (!request.file) {
      throw new ResponseError(400, "Image file is required");
    }

    const imageUrl = await CloudinaryUtil.uploadFile(request.file.path);

    const avatar = await prismaClient.avatar.create({
      data: {
        image_url: imageUrl,
      },
    });

    return avatar;
  }

  static async list(): Promise<AvatarResponse[]> {
    const avatars = await prismaClient.avatar.findMany();
    return avatars;
  }

  static async get(id: number): Promise<AvatarResponse> {
    const avatar = await prismaClient.avatar.findUnique({
      where: { id: id },
    });

    if (!avatar) {
      throw new ResponseError(404, "Avatar not found");
    }

    return avatar;
  }

  static async update(request: UpdateAvatarRequest): Promise<AvatarResponse> {
    const validatedRequest = Validation.validate(AvatarValidation.UPDATE, {
      id: request.id,
    });

    const checkAvatar = await prismaClient.avatar.findUnique({
      where: { id: validatedRequest.id },
    });

    if (!checkAvatar) {
      throw new ResponseError(404, "Avatar not found");
    }

    let imageUrl = checkAvatar.image_url;

    if (request.file) {
      imageUrl = await CloudinaryUtil.uploadFile(request.file.path);
    }

    const avatar = await prismaClient.avatar.update({
      where: { id: validatedRequest.id },
      data: {
        image_url: imageUrl,
      },
    });

    return avatar;
  }

  static async delete(id: number): Promise<string> {
    const checkAvatar = await prismaClient.avatar.findUnique({
      where: { id: id },
    });

    if (!checkAvatar) {
      throw new ResponseError(404, "Avatar not found");
    }

    // Cek apakah ada user yang pakai avatar ini
    const usersUsingAvatar = await prismaClient.user.count({
      where: { avatar_id: id },
    });

    if (usersUsingAvatar > 0) {
      throw new ResponseError(400, "Cannot delete avatar, still used by users");
    }

    await prismaClient.avatar.delete({
      where: { id: id },
    });

    return "Avatar deleted successfully";
  }

  // ==================== HELPER FUNCTIONS ====================

  static async getRandomAvatarId(): Promise<number> {
    const avatars = await prismaClient.avatar.findMany({
      select: { id: true },
    });

    if (avatars.length === 0) {
      throw new ResponseError(500, "No avatars available in database");
    }

    const randomIndex = Math.floor(Math.random() * avatars.length);
    return avatars[randomIndex].id;
  }

  // ==================== USER AVATAR FUNCTIONS ====================

  static async getUserAvatar(user_id: number): Promise<AvatarResponse> {
    const user = await prismaClient.user.findUnique({
      where: { id: user_id },
      include: { avatar: true },
    });

    if (!user || !user.avatar) {
      throw new ResponseError(404, "User or Avatar not found");
    }

    return user.avatar;
  }

  static async updateUserAvatar(
    user_id: number,
    avatar_id: number
  ): Promise<AvatarResponse> {
    const avatar = await prismaClient.avatar.findUnique({
      where: { id: avatar_id },
    });

    if (!avatar) {
      throw new ResponseError(404, "Avatar not found");
    }

    await prismaClient.user.update({
      where: { id: user_id },
      data: {
        avatar_id: avatar_id,
        image_url: avatar.image_url,
      },
    });

    return avatar;
  }

  static async resetUserAvatar(user_id: number): Promise<AvatarResponse> {
    const randomAvatarId = await this.getRandomAvatarId();
    return await this.updateUserAvatar(user_id, randomAvatarId);
  }
}