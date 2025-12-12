import { Request, Response, NextFunction } from "express"
import { AvatarService } from "../services/avatar-service"

export class AvatarController {
    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await AvatarService.create({
                file: req.file
            })
            res.status(201).json({
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async list(req: Request, res: Response, next: NextFunction) {
        try {
            const response = await AvatarService.list()
            res.status(200).json({
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async get(req: Request, res: Response, next: NextFunction) {
        try {
            const avatarId = parseInt(req.params.id)
            const response = await AvatarService.get(avatarId)
            res.status(200).json({
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async update(req: Request, res: Response, next: NextFunction) {
        try {
            const avatarId = parseInt(req.params.id)
            const response = await AvatarService.update({
                id: avatarId,
                file: req.file
            })
            res.status(200).json({
                data: response
            })
        } catch (error) {
            next(error)
        }
    }

    static async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const avatarId = parseInt(req.params.id)
            await AvatarService.delete(avatarId)
            res.status(200).json({
                data: "OK"
            })
        } catch (error) {
            next(error)
        }
    }
}