import { Request, Response, NextFunction } from "express"
import { LearningProgressResponse, LearningResponse } from "../models/learning-model"
import { LearningService } from "../services/learning-service"
import { UserRequest } from "../models/user-model"

export class LearningController {
    static async getLearningById(req: Request, res: Response, next: NextFunction) {
        try {
            const learningId = parseInt(req.params.id)
            const response: LearningResponse = await LearningService.getLearningById(learningId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }
    static async getLearningProgress(req: Request, res: Response, next: NextFunction) {
        try {
            const learningProgressId = parseInt(req.params.id)
            const response: LearningProgressResponse = await LearningService.getLearningProgressById(learningProgressId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async getAllLearningProgresses(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = Number(req.user?.id)
            const response: LearningProgressResponse[] = await LearningService.getAllLearningProgresses(userId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    } 

    static async getAllLearnings(req: Request, res: Response, next: NextFunction) {
        try {
            const response: LearningResponse[] = await LearningService.getAllLearnings()

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async startLearning(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = Number(req.user?.id)
            const learningId = parseInt(req.params.id)
            const response: LearningProgressResponse = await LearningService.startLearning(userId, learningId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async completeLearning(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const learningProgressId = parseInt(req.params.id)
            const response: LearningProgressResponse = await LearningService.completeLearning(learningProgressId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }
}