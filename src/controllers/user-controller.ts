import { Request, Response, NextFunction } from "express"
import {
    LoginUserRequest,
    RegisterUserRequest,
    UserRequest,
    UserResponse,
} from "../models/user-model"
import { UserService } from "../services/user-service"

export class UserController {
    static async register(req: Request, res: Response, next: NextFunction) {
        try {
            const request: RegisterUserRequest = req.body as RegisterUserRequest
            const response: UserResponse = await UserService.register(request)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async registerFromGuest(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const request: RegisterUserRequest = req.body as RegisterUserRequest
            const userId = req.user?.id
            
            if (!userId || !req.user?.isGuest) {
                throw new Error("Only guest users can use this endpoint")
            }

            const response: UserResponse = await UserService.register({
                ...request,
                userId,
            })

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async login(req: Request, res: Response, next: NextFunction) {
        try {
            const request: LoginUserRequest = req.body as LoginUserRequest
            const response: UserResponse = await UserService.login(request)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async guest(req: Request, res: Response, next: NextFunction) {
        try {
            const response: UserResponse = await UserService.guest(req)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }
}

