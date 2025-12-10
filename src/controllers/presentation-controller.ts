import { Request, Response, NextFunction } from "express"
import { PresentationService } from "../services/presentation-service"
import { CreatePresentationRequest } from "../models/presentation-model"
import { UserRequest } from "../models/user-model"

export class PresentationController {
    static async create(req: UserRequest, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    errors: 'Video file is required'
                })
            }

            const request: CreatePresentationRequest = {
                title: req.body.title,
                user_id: req.user!.id,
                video_url: req.file.path
            }

            const response = await PresentationService.create(request, req.file.path)
            
            const analysis = await PresentationService.getAnalysis(response.id)
            
            res.status(200).json({
                data: {
                    presentation: response,
                    analysis: analysis
                }
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
}