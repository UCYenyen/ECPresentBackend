import { Request, Response, NextFunction } from "express"
import { PresentationService } from "../services/presentation-service"
import { CreatePresentationRequest } from "../models/presentation-model"
import { UserRequest } from "../models/user-model"
import { FeedbackService } from "../services/feedback-service"
import { Validation } from "../validations/validation"

export class PresentationController {
    static async create(req: UserRequest, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    errors: 'Video file is required'
                })
            }

            if (!req.body.title) {
                return res.status(400).json({
                    errors: 'Title is required'
                })
            }

            const request: CreatePresentationRequest = {
                title: req.body.title,
                user_id: req.user!.id,
                video_url: req.file.path
            }

            const response = await PresentationService.create(request, req.file.path)
            
            res.status(200).json({
                data: {
                    presentation: response
                }
            })
        } catch (e) {
            next(e)
        }
    }
    
    static async submitAnswer(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                return res.status(400).json({ errors: 'Audio file is required' })
            }

            const questionId = parseInt(req.params.questionId)
            if (isNaN(questionId)) {
                return res.status(400).json({ errors: 'Invalid question ID' })
            }

            const audioPath = req.file.path

            const result = await PresentationService.submitAnswer(questionId, audioPath)
            res.status(200).json({
                data: result,
                message: "Answer submitted and analyzed successfully"
            })
        } catch (e) {
            next(e)
        }
    }

    static async getAnalysis(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.presentationId)
            
            const response = await PresentationService.getAnalysis(presentationId)
            res.status(200).json({
                data: response
            })
        } catch (e) {
            next(e)
        }
    }

    static async getFinalFeedback(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.presentationId)
            
            const result = await FeedbackService.generateFinalFeedback(presentationId) 
            res.status(200).json({
                data: result
            })
        } catch (e) {
            next(e)
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.presentationId)
            const { title, status } = req.body
            
            const result = await PresentationService.update(presentationId, title, status)
            res.status(200).json({ data: result })
        } catch (e) {
            next(e)
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.presentationId)
            
            const result = await PresentationService.delete(presentationId)
            res.status(200).json({ data: result })
        } catch (e) {
            next(e)
        }
    }
}