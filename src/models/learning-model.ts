import { string } from "zod"
import { Learning, LearningStatus } from "@prisma/client";

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
    status: LearningStatus;
    createdAt: Date;
    updatedAt: Date;
    learning: Learning;
}

export function toLearningProgressResponse(learningProgress: LearningProgressResponse): LearningProgressResponse{
    return {
        id: learningProgress.id,
        user_id: learningProgress.user_id,
        status: learningProgress.status,
        createdAt: learningProgress.createdAt,
        updatedAt: learningProgress.updatedAt,
        learning: learningProgress.learning,
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