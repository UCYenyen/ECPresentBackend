import { string } from "zod"
import { Learning } from "@prisma/client";

export interface LearningResponse{
    id: number;
    title: string;
    description: string;
    video_url: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface LearningProgressResponse{
    id: number;
    user_id: number;
    learning_id: number;
    isCompleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export function toLearningProgressResponse(learningProgress: LearningProgressResponse): LearningProgressResponse{
    return {
        id: learningProgress.id,
        user_id: learningProgress.user_id,
        learning_id: learningProgress.learning_id,
        isCompleted: learningProgress.isCompleted,
        createdAt: learningProgress.createdAt,
        updatedAt: learningProgress.updatedAt,
    }
}

export function toLearningResponse(Learning: Learning): LearningResponse{
    return {
        id: Learning.id,
        title: Learning.title,
        description: Learning.description,
        video_url: Learning.video_url,
        createdAt: Learning.createdAt,
        updatedAt: Learning.updatedAt,
    }
}