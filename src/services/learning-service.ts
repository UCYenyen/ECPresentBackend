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
  static async getAllLearningProgresses(
    user_id: number
  ): Promise<LearningProgressResponse[]> {
    const validatedData = Validation.validate(LearningValidation.GET_ALL, {
      id: user_id,
    });
    const learningProgressData = await prismaClient.learningProgress.findMany({
      include: {
        learning: true,
      },
      where: {
        user_id: validatedData.id,
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
      include:{
        learning: true
      }
    });

    return toLearningProgressResponse(learningProgress);
  }

  static async completeLearning(
    learning_progress_id: number
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
      include:{
        learning: true
      }
    });

    return toLearningProgressResponse(updateLeearningProgress);
  }

  static async getLearningProgressById(
    id: number
  ): Promise<LearningProgressResponse> {
    const validatedData = Validation.validate(LearningValidation.GET_ALL, {
      id: id,
    });

    const learningProgressData = await prismaClient.learningProgress.findUnique(
      {
        where: { id: validatedData.id },
        include: {
          learning: true,
        },
      }
    );

    if (!learningProgressData) {
      throw new ResponseError(404, "Learning progress not found");
    }

    return toLearningProgressResponse(learningProgressData);
  }

  static async getLearningById(id: number): Promise<LearningResponse> {
    const learningData = await prismaClient.learning.findUnique({
      where: { id: id },
    });

    if (!learningData) {
      throw new ResponseError(404, "Learning not found");
    }

    return {
      id: learningData.id,
      title: learningData.title,
      description: learningData.description,
      video_url: learningData.video_url,
      createdAt: learningData.createdAt,
      updatedAt: learningData.updatedAt,
    };
  } 
}
