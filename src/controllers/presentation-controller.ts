import { Request, Response, NextFunction } from 'express';
import { PresentationService } from '../services/presentation-service';
import { FeedbackService } from '../services/feedback-service';
import { ResponseError } from '../error/response-error';
import { UserRequest } from '../models/user-model';

export class PresentationController {
    static async create(req: UserRequest, res: Response, next: NextFunction) {
        try {
            if (!req.file) throw new ResponseError(400, "Video file is required");

            const userId = req.user?.id;
            const { title } = req.body;

            if (!userId) throw new ResponseError(401, "Unauthorized");

            const response = await PresentationService.create({
                user_id: userId,
                title: title || "Untitled Presentation",
                video_url: req.file.path
            }, req.file.path);

            res.status(201).json({
                success: true,
                data: response
            });

        } catch (error) {
            next(error);
        }
    }

    static async getAnalysis(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.presentationId);
            const response = await PresentationService.getAnalysis(presentationId);
            
            res.status(200).json({
                success: true,
                data: response
            });
        } catch (error) {
            next(error);
        }
    }

    static async getFinalFeedback(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.presentationId);
            const response = await FeedbackService.generateFinalFeedback(presentationId);
            
            res.status(200).json({
                success: true,
                data: response
            });
        } catch (error) {
            next(error);
        }
    }

    static async submitAnswer(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) throw new ResponseError(400, "Audio file is required");

            const questionId = parseInt(req.params.questionId);
            
            const response = await PresentationService.submitAnswer(
                questionId, 
                req.file.path,
                req.file.mimetype
            );

            res.status(201).json({
                success: true,
                data: response
            });
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.id);
            const response = await PresentationService.getById(presentationId);
            
            res.status(200).json({
                success: true,
                data: response
            });
        } catch (error) {
            next(error);
        }
    }

    static async list(req: UserRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.id;
            if (!userId) throw new ResponseError(401, "Unauthorized");

            const response = await PresentationService.list(userId);
            
            res.status(200).json({
                success: true,
                data: response
            });
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const presentationId = parseInt(req.params.id);
            const response = await PresentationService.delete(presentationId);
            
            res.status(200).json({
                success: true,
                message: response
            });
        } catch (error) {
            next(error);
        }
    }
}