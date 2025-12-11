import { Request } from "express"
import { ResponseError } from "../error/response-error"
import {
    LoginUserRequest,
    RegisterUserRequest,
    toUserResponse,
    UpdateUserRequest,
    UserResponse,
} from "../models/user-model"
import { prismaClient } from "../utils/database-util"
import { UserValidation } from "../validations/user-validation"
import { Validation } from "../validations/validation"
import bcrypt from "bcrypt"

export class UserService {
    static async register(request: RegisterUserRequest): Promise<UserResponse> {
        const validatedData = Validation.validate(
            UserValidation.REGISTER,
            request
        )

        const emailExists = await prismaClient.user.findFirst({
            where: {
                email: validatedData.email,
            },
        })

        if (emailExists) {
            throw new ResponseError(400, "Email has already existed!")
        }

        validatedData.password = await bcrypt.hash(validatedData.password, 10)

        // Jika ada userId (guest user), update user tersebut
        if (request.userId) {
            const existingUser = await prismaClient.user.findUnique({
                where: { id: request.userId },
            })

            if (!existingUser || !existingUser.is_guest) {
                throw new ResponseError(400, "Invalid guest user!")
            }

            const user = await prismaClient.user.update({
                data: {
                    username: validatedData.username,
                    email: validatedData.email,
                    password: validatedData.password,
                    is_guest: false,
                },
                where: {
                    id: request.userId,
                },
            })

            return toUserResponse(user.id, user.username, user.email, user.avatar_id, user.image_url, user.is_guest)
        }

        // Jika tidak ada userId, create user baru
        const user = await prismaClient.user.create({
            data: {
                username: validatedData.username,
                email: validatedData.email,
                image_url: "",
                password: validatedData.password,
            },
        })

        return toUserResponse(user.id, user.username, user.email, user.avatar_id, user.image_url, user.is_guest)
    }

    static async login(request: LoginUserRequest): Promise<UserResponse> {
        const validatedData = Validation.validate(UserValidation.LOGIN, request)

        const user = await prismaClient.user.findFirst({
            where: {
                email: validatedData.email,
            },
        })

        if (!user) {
            throw new ResponseError(400, "Invalid email or password!")
        }

        const passwordIsValid = await bcrypt.compare(
            validatedData.password,
            user.password
        )

        if (!passwordIsValid) {
            throw new ResponseError(400, "Invalid email or password!")
        }

        return toUserResponse(user.id, user.username, user.email, user.avatar_id, user.image_url, user.is_guest)
    }

    static async guest(request: Request) : Promise<UserResponse> {
        const user = await prismaClient.user.create({
            data: {
                username: `guest_${Date.now()}`,
                email: `guest_${Date.now()}@example.com`,
                password: await bcrypt.hash(`guest_password_${Date.now()}`, 10),
                image_url: "",
                is_guest: true,
                avatar_id: 1
            },
        })

        return toUserResponse(user.id, user.username, user.email, user.avatar_id, user.image_url, user.is_guest)
    }

    static async getUserById(userId: number): Promise<UserResponse> {
        const user = await prismaClient.user.findUnique({
            where: { id: userId },
        })
        if (!user) {
            throw new ResponseError(404, "User not found")
        }
        return toUserResponse(user.id, user.username, user.email, user.avatar_id, user.image_url, user.is_guest)
    }

    static async updateUserById(
        userId: number,
        updateData: UpdateUserRequest
    ): Promise<UserResponse> {
        const validatedData = Validation.validate(
            UserValidation.UPDATE,
            updateData
        )

        if (validatedData.password) {
            validatedData.password = await bcrypt.hash(validatedData.password, 10)
        }   

        const user = await prismaClient.user.findUnique({
            where: { id: userId },
        })
        if (!user) {
            throw new ResponseError(404, "User not found")
        }
        const updatedUser = await prismaClient.user.update({
            where: { id: userId },
            data: {
                username: validatedData.username || user.username,
                email: validatedData.email || user.email,
                password: validatedData.password || user.password,
                avatar_id: validatedData.avatar_id || user.avatar_id,
            },
        })
        return toUserResponse(updatedUser.id, updatedUser.username, updatedUser.email, updatedUser.avatar_id, updatedUser.image_url, updatedUser.is_guest)
    }
}
