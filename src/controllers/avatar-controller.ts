import { Request, Response, NextFunction } from "express";
import { AvatarService } from "../services/avatar-service";
import { UserRequest } from "../models/user-model";

export class AvatarController {
  // ==================== CRUD AVATAR (ADMIN) ====================

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AvatarService.create({
        file: req.file,
      });

      res.status(201).json({
        success: true,
        message: "Avatar created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AvatarService.list();

      res.status(200).json({
        success: true,
        message: "Avatars retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const result = await AvatarService.get(id);

      res.status(200).json({
        success: true,
        message: "Avatar retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const result = await AvatarService.update({
        id: id,
        file: req.file,
      });

      res.status(200).json({
        success: true,
        message: "Avatar updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const result = await AvatarService.delete(id);

      res.status(200).json({
        success: true,
        message: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== USER AVATAR FUNCTIONS ====================

  static async getUserAvatar(req: UserRequest, res: Response, next: NextFunction) {
    try {
      const user_id = req.user!.id;
      const result = await AvatarService.getUserAvatar(user_id);

      res.status(200).json({
        success: true,
        message: "User avatar retrieved successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateUserAvatar(req: UserRequest, res: Response, next: NextFunction) {
    try {
      const user_id = req.user!.id;
      const avatar_id = parseInt(req.params.avatar_id);

      const result = await AvatarService.updateUserAvatar(user_id, avatar_id);

      res.status(200).json({
        success: true,
        message: "Avatar updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetUserAvatar(req: UserRequest, res: Response, next: NextFunction) {
    try {
      const user_id = req.user!.id;
      const result = await AvatarService.resetUserAvatar(user_id);

      res.status(200).json({
        success: true,
        message: "Avatar reset to random default",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}