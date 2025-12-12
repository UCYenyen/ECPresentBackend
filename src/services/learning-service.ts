import { prismaClient } from "../utils/database-util";
import {
  LearningProgressResponse,
  toLearningProgressResponse,
  LearningResponse,
} from "../models/learning-model";
import { Validation } from "../validations/validation";
import { LearningValidation } from "../validations/learning-validation";
import { ResponseError } from "../error/response-error";

export class LearningService {
  static async getLearningProgress(
    userId: number
  ): Promise<LearningProgressResponse[]> {
    const validatedData = Validation.validate(LearningValidation.GET_ALL, {
      user_id: userId,
    });

    const learningProgressData = await prismaClient.learningProgress.findMany({
      where: { user_id: validatedData.user_id },
      include: {
        learning: true,
      },
    });
    return learningProgressData.map((lp) => toLearningProgressResponse(lp));
  }

  static async getAllLearningProgresses(
    user_id: number
  ): Promise<LearningProgressResponse[]> {
    const learningProgressData = await prismaClient.learningProgress.findMany({
      include: {
        learning: true,
      },
      where: {
        user_id: user_id,
      },
    });
    return learningProgressData.map((lp) => toLearningProgressResponse(lp));
  }

  static async getAllLearnings(): Promise<LearningResponse[]> {
    const learnings = await prismaClient.learning.findMany();
    return learnings.map((learning) => ({
      id: learning.id,
      title: learning.title,
      description: learning.description,
      video_url: learning.video_url,
      createdAt: learning.createdAt,
      updatedAt: learning.updatedAt,
    }));
  }
  static async startLearning(
    userId: number,
    learningId: number
  ): Promise<LearningProgressResponse> {
    const validatedData = Validation.validate(
      LearningValidation.GET_ALL_LEARNING_PROGRESS,
      {
        user_id: userId,
        learning_id: learningId,
      }
    );

    const learningProgress = await prismaClient.learningProgress.create({
      data: {
        user_id: validatedData.user_id,
        learning_id: validatedData.learning_id,
        status: "ONPROGRESS",
      },
    });

    return toLearningProgressResponse(learningProgress);
  }

  static async completeLearning(
    learning_progress_id: number,
  ): Promise<LearningProgressResponse> {
    const validatedData = Validation.validate(
      LearningValidation.UPDATE_LEARNING_PROGRESS,
      {
        id: learning_progress_id,
      }
    );
    const updateLeearningProgress = await prismaClient.learningProgress.update({
      where: { id: validatedData.id },
      data: { status: "COMPLETED" },
    });

    return toLearningProgressResponse(updateLeearningProgress);
  }

  static async getLearningProgressById(
    id: number
  ): Promise<LearningProgressResponse> {
    const validatedData = Validation.validate(LearningValidation.GET_ALL, {
      id: id,
    });

    const learningProgressData = await prismaClient.learningProgress.findUnique({
      where: { id: validatedData.id },
      include: {
        learning: true,
      },
    });

    if (!learningProgressData) {
      throw new ResponseError(404, "Learning progress not found");
    }

    return toLearningProgressResponse(learningProgressData);
  }
}
