import { ResponseError } from "../error/response-error"
import { GetAllUserPresentations, PresentationData, PresentationsDatas, toPresentationResponse, toPresentationsResponse } from "../models/presentation-model"
import {
    LoginUserRequest,
    RegisterUserRequest,
    toUserResponse,
    UserResponse,
} from "../models/user-model"
import { prismaClient } from "../utils/database-util"
import { PresentationValidation } from "../validations/presentation-validation"
import { UserValidation } from "../validations/user-validation"
import { Validation } from "../validations/validation"
import bcrypt from "bcrypt"

export class UserService {
    static async getPresentations(request: GetAllUserPresentations): Promise<PresentationsDatas> {
        const validatedData = Validation.validate(
            PresentationValidation.GET,
            request
        )
        const presentation = await prismaClient.presentation.findMany({
            where: {
                userId: validatedData.userId,
            },
        })

        return toPresentationsResponse(presentation);

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

        return toUserResponse(user.id, user.username, user.email)
    }
}
