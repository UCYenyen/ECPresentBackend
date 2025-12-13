import { Feedback } from "@prisma/client";

export interface VideoAnalysisResult {
    expression: number;
    intonation: number;
    posture: number;
    video_score: number;
    overall_score: number;
    grade: string;
    suggestion: string;
    questions: string[];
}

export interface AudioAnalysisResult {
    score: number;
    analysis: {
        delivery: {
            pace: "too_slow" | "ideal" | "too_fast";
            wpm: number;
            clarity: number;
        };
        fillerWords: {
            totalCount: number;
            distinctWords: string[];
        };
        suggestion: string;
    };
}

export interface FeedbackResponse {
  id: number;
  presentation_id: number;
  expression: number;
  intonation: number;
  posture: number;
  video_score: number;
  audio_score: number | null;
  overall_rating: number;
  grade: string;
  video_suggestion: string;
  audio_suggestion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toFeedbackResponse(feedback: Feedback): FeedbackResponse {
  return {
    id: feedback.id,
    presentation_id: feedback.presentation_id,
    expression: feedback.expression,
    intonation: feedback.intonation,
    posture: feedback.posture,
    video_score: feedback.video_score,
    audio_score: feedback.audio_score,
    overall_rating: feedback.overall_rating,
    grade: feedback.grade,
    video_suggestion: feedback.video_suggestion,
    audio_suggestion: feedback.audio_suggestion,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
  };
}