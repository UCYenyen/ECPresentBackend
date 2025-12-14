import { Request, Response, NextFunction } from 'express'
import { PresentationService } from '../services/presentation-service'
import { FeedbackService } from '../services/feedback-service'
import { ResponseError } from '../error/response-error'
import { UserRequest } from '../models/user-model'

export class PresentationController {
    
    private static validateId(id: string): number {
        const parsed = parseInt(id)
        if (isNaN(parsed)) throw new ResponseError(400, "Invalid ID format")
        return parsed
    }

    static async create(req: UserRequest, res: Response, next: NextFunction) {
        try {
            if (!req.file) throw new ResponseError(400, "Video file is required")

            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized") 

            const { title } = req.body

            const response = await PresentationService.create({
                user_id: userId,
                title: title || "Untitled Presentation",
                video_url: req.file.path
            }, req.file.path)

            res.status(201).json({
                success: true,
                data: response
            })

        } catch (error) {
            next(error)
        }
    }

    static async getAnalysis(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const presentationId = PresentationController.validateId(req.params.presentationId)
            
            const response = await PresentationService.getAnalysis(presentationId, userId)
            
            res.status(200).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async getFinalFeedback(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const presentationId = PresentationController.validateId(req.params.presentationId)
            
            const response = await FeedbackService.generateFinalFeedback(presentationId, userId)
            
            res.status(200).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async submitAnswer(req: UserRequest, res: Response, next: NextFunction) {
        try {
            if (!req.file) throw new ResponseError(400, "Audio file is required")

            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const presentationId = PresentationController.validateId(req.params.presentationId)

            const { questionText } = req.body
            if (!questionText) throw new ResponseError(400, "Question text is required")

            const response = await PresentationService.submitAnswer(
                presentationId, 
                req.file.path,
                userId,
                questionText
            )

            res.status(201).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async getById(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const presentationId = PresentationController.validateId(req.params.id)
            
            const response = await PresentationService.getById(presentationId, userId)
            
            res.status(200).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async list(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const response = await PresentationService.list(userId)
            
            res.status(200).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async delete(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const presentationId = PresentationController.validateId(req.params.id)
            
            const response = await PresentationService.delete(presentationId, userId)
            
            res.status(200).json({
                success: true,
                message: response
            })
        } catch (error) {
            next(error)
        }
    }
}