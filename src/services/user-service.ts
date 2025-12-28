import { Request } from "express"
import { UserRole } from "@prisma/client"
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
            select: {
                id: true,
            },
        })

        if (emailExists) {
            throw new ResponseError(400, "Email has already existed!")
        }

        validatedData.password = await bcrypt.hash(validatedData.password, 10)

        if (request.user_id) {
            const existingUser = await prismaClient.user.findUnique({
                where: { id: request.user_id },
                include: { 
                    avatar: true 
                },
            })

            if (!existingUser || existingUser.role !== UserRole.GUEST) {
                throw new ResponseError(400, "Invalid guest user!")
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
                include: {
                    avatar: true
                },
            })

            return toUserResponse(user.id, user.username, user.email, user.role, user.avatar)
        }

        const user = await prismaClient.user.create({
            data: {
                username: validatedData.username,
                email: validatedData.email,
                image_url: "",
                password: validatedData.password,
                role: UserRole.USER,
            },
            include: {
                avatar: true
            },
        })

       return toUserResponse(user.id, user.username, user.email, user.role, user.avatar)
    }

    static async login(request: LoginUserRequest): Promise<UserResponse> {
        const validatedData = Validation.validate(UserValidation.LOGIN, request)

        const user = await prismaClient.user.findFirst({
            where: {
                email: validatedData.email,
            },
            include: {
                avatar: true,
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

       return toUserResponse(user.id, user.username, user.email, user.role, user.avatar)
    }

    static async guest(request: Request) : Promise<UserResponse> {
        const user = await prismaClient.user.create({
            data: {
                username: `guest_${Date.now()}`,
                email: `guest_${Date.now()}@example.com`,
                password: await bcrypt.hash(`guest_password_${Date.now()}`, 10),
                image_url: "",
                role: UserRole.GUEST,
            },
            include: {
                avatar: true
            },
        })

        return toUserResponse(user.id, user.username, user.email, user.role, user.avatar)
    }

    static async getUserById(user_id: number): Promise<UserResponse> {
        const validatedData = Validation.validate(UserValidation.GET_PROFILE, {
              id: user_id,
        });
        const user = await prismaClient.user.findUnique({
            where: { id: validatedData.id }, 
            include: {
                avatar: true 
            },
        })
        if (!user) {
            throw new ResponseError(404, "User not found")
        }
        return toUserResponse(user.id, user.username, user.email, user.role, user.avatar)
    }

    static async updateUserById(
        user_id: number,
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
            where: { id: user_id },
            include: { 
                avatar: true 
            },
        })
        if (!user) {
            throw new ResponseError(404, "User not found")
        }
        const updatedUser = await prismaClient.user.update({
            where: { id: user_id },
            include: {
                avatar: true
            },
            data: {
                username: validatedData.username || user.username,
                email: validatedData.email || user.email,
                password: validatedData.password || user.password,
                avatar_id: validatedData.avatar_id || user.avatar_id,
            },
        })
        return toUserResponse(updatedUser.id, updatedUser.username, updatedUser.email, updatedUser.role, updatedUser.avatar)
    }
}
