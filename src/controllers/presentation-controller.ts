import { Request, Response, NextFunction } from 'express'
import { PresentationService } from '../services/presentation-service'
import { FeedbackService } from '../services/feedback-service'
import { ResponseError } from '../error/response-error'
import { UserRequest } from '../models/user-model'
import { readVideoDurationSec } from '../utils/video-metadata'

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

            const { title, video_duration_ms, sample_label, experiment_label } = req.body
            const clientDurationMs = Number(video_duration_ms)

            const response = await PresentationService.create({
                user_id: userId,
                title: title || "Untitled Presentation",
                video_url: req.file.path
            }, req.file.path, {
                requestReceivedAt: req.receivedAt,
                fileStoredAt: new Date(),
                fileSizeBytes: req.file.size,
                mimeType: req.file.mimetype,
                videoDurationSec: readVideoDurationSec(req.file.path)
                    ?? (clientDurationMs > 0 ? clientDurationMs / 1000 : undefined),
                sampleLabel: sample_label || title,
                experimentLabel: experiment_label
            })

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
            const response = await PresentationService.submitAnswer(
                presentationId, 
                req.file.path,
                userId
            )

            res.status(201).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async saveClientMetrics(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")

            const presentationId = PresentationController.validateId(req.params.presentationId)
            const response = await PresentationService.saveClientMetrics(presentationId, userId, req.body)

            res.status(200).json({
                success: true,
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async getAverageScores(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")
            
            const response = await PresentationService.getAverageScores(userId)
            
            res.status(200).json({
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


    static async updateNotes(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id
            if (!userId) throw new ResponseError(401, "Unauthorized")
            const presentationId = PresentationController.validateId(req.params.presentationId);
            const { notes } = req.body; 
            
            const response = await PresentationService.updateNotes(userId!, presentationId, notes);
            res.status(200).json({
                data: response
            });
        } catch (e) {
            next(e);
        }
    }
}