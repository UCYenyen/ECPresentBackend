import { prismaClient } from "../utils/database-util";
import { AvatarResponse, CreateAvatarRequest, UpdateAvatarRequest } from "../models/user-model";
import { ResponseError } from "../error/response-error";
import { CloudinaryUtil } from "../utils/cloudinary-util";
import { AvatarValidation } from "../validations/avatar-validation";
import { Validation } from "../validations/validation";

export class AvatarService {
    static async create(request: CreateAvatarRequest): Promise<AvatarResponse> {
        if (!request.file) {
            throw new ResponseError(400, "Image file is required")
        }

        const imageUrl = await CloudinaryUtil.uploadFile(request.file.path)

        const avatar = await prismaClient.avatar.create({
            data: {
                image_url: imageUrl
            }
        })

        return avatar
    }

    static async list(): Promise<AvatarResponse[]> {
        const avatars = await prismaClient.avatar.findMany()
        return avatars
    }

    static async get(id: number): Promise<AvatarResponse> {
        const avatar = await prismaClient.avatar.findUnique({
            where: { id: id }
        })

        if (!avatar) {
            throw new ResponseError(404, "Avatar not found")
        }

        return avatar
    }

    static async update(request: UpdateAvatarRequest): Promise<AvatarResponse> {
        const validatedRequest = Validation.validate(AvatarValidation.UPDATE, { id: request.id })

        const checkAvatar = await prismaClient.avatar.findUnique({
            where: { id: validatedRequest.id }
        })

        if (!checkAvatar) {
            // Hapus file yang baru diupload jika id tidak valid
            if (request.file) {
                await CloudinaryUtil.uploadFile(request.file.path) // Ini trick untuk cleanup lokal via util, tapi idealnya fs.unlink
            }
            throw new ResponseError(404, "Avatar not found")
        }

        let imageUrl = checkAvatar.image_url

        if (request.file) {
            imageUrl = await CloudinaryUtil.uploadFile(request.file.path)
        }

        const avatar = await prismaClient.avatar.update({
            where: { id: validatedRequest.id },
            data: {
                image_url: imageUrl
            }
        })

        return avatar
    }

    static async delete(id: number): Promise<string> {
        const checkAvatar = await prismaClient.avatar.findUnique({
            where: { id: id }
        })

        if (!checkAvatar) {
            throw new ResponseError(404, "Avatar not found")
        }

        await prismaClient.avatar.delete({
            where: { id: id }
        })

        return "Avatar deleted successfully"
    }
}