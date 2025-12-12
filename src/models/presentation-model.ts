import { Feedbacks, Question, Answer } from "@prisma/client";

export interface CreatePresentationRequest {
    title: string;
    user_id: number;
    video_url: string;
}

export interface PresentationResponse {
    id: number;
    title: string;
    video_url: string;
    status: string;
}

export interface PresentationAnalysisResponse {
    status: string;
    feedback: Feedbacks | null;
    questions: Question[]; 
}

export interface FinalFeedbackResponse {
    presentation_id: number;
    video_feedback: Feedbacks;
    answers_summary: (Answer & { question: Question })[];
    average_audio_score: number;
    final_calculated_score: number;
    status: string;
}