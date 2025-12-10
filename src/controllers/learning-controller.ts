import { Request, Response, NextFunction } from "express"
import { LearningProgressResponse, LearningResponse } from "../models/learning-model"
import { LearningService } from "../services/learning-service"

export class LearningController {
    static async getLearningProgress(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = parseInt(req.params.userId)
            const response: LearningProgressResponse[] = await LearningService.getLearningProgress(userId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }

    static async getAllLearningProgresses(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = parseInt(req.params.userId)
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

    static async startLearning(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = parseInt(req.body.user_id)
            const learningId = parseInt(req.body.learning_id)
            const response: LearningProgressResponse = await LearningService.startLearning(userId, learningId)

            res.status(200).json({
                data: response,
            })
        } catch (error) {
            next(error)
        }
    }
}