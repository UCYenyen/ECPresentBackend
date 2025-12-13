import { Presentation, Question, Answer, PresentationStatus, Feedback } from "@prisma/client";
import { AudioAnalysisResult } from "./feedback-model";

export interface CreatePresentationRequest {
  user_id: number;
  title?: string;
  video_url: string;
}

export interface AnswerResponse {
  id: number;
  question_id: number;
  audio_url: string | null; 
  score: number | null;
  analysis: AudioAnalysisResult["analysis"] | null; 
  createdAt: Date;
}

export function toAnswerResponse(answer: Answer): AnswerResponse {
  return {
    id: answer.id,
    question_id: answer.question_id,
    audio_url: answer.audio_url,
    score: answer.score,
    analysis: answer.analysis as unknown as AudioAnalysisResult["analysis"] | null,
    createdAt: answer.createdAt,
  };
}

export interface QuestionResponse {
  id: number;
  presentation_id: number;
  question: string;
  time_limit_seconds: number; 
  answers?: AnswerResponse[];
  createdAt: Date;
}

export function toQuestionResponse(question: Question, answers?: Answer[]): QuestionResponse {
  return {
    id: question.id,
    presentation_id: question.presentation_id,
    question: question.question,
    time_limit_seconds: question.time_limit_seconds,
    answers: answers ? answers.map(toAnswerResponse) : undefined,
    createdAt: question.createdAt,
  };
}

export interface PresentationResponse {
  id: number;
  user_id: number;
  title: string;
  video_url: string;
  status: PresentationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function toPresentationResponse(presentation: Presentation): PresentationResponse {
  return {
    id: presentation.id,
    user_id: presentation.user_id,
    title: presentation.title,
    video_url: presentation.video_url,
    status: presentation.status,
    createdAt: presentation.createdAt,
    updatedAt: presentation.updatedAt,
  };
}

export interface PresentationAnalysisResponse {
  status: PresentationStatus;
  feedback: Feedback | null;
  questions: Question[];
}

export interface FinalFeedbackResponse {
  presentation_id: number;
  video_feedback: Feedback;
  answers_summary: (Answer & { question: Question })[];
  average_audio_score: number;
  final_calculated_score: number;
  status: string;
}