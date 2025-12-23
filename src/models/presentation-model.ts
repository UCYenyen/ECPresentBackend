import { Presentation, Question, Answer, PresentationStatus, Feedback } from "@prisma/client"

export interface CreatePresentationRequest {
  user_id: number
  title?: string
  video_url: string
}

export interface UpdatePresentationRequest {
    id: number
    title?: string
    status?: PresentationStatus
}

export interface SubmitAnswerRequest {
    presentationId: number
    audioPath: string
    questionText: string
}

export interface AnswerResponse {
  id: number
  question_id: number
  audio_url: string | null 
  score: number | null
  suggestion: string | null
  createdAt: Date
}

export interface QuestionResponse {
  id: number
  presentation_id: number
  question: string
  time_limit_seconds: number 
  answer?: AnswerResponse
  createdAt: Date
}

export interface PresentationResponse {
  id: number
  user_id: number
  title: string
  video_url: string
  status: PresentationStatus
  createdAt: Date
  updatedAt: Date
}

export interface PresentationAnalysisResponse {
  status: PresentationStatus
  feedback: Feedback | null
  question: (Question & { answer: Answer | null }) | null
}

export interface FinalFeedbackResponse {
  presentation_id: number
  expression: number
  intonation: number
  posture: number
  video_score: number
  audio_score: number | null
  overall_rating: number | null
  grade: string | null
  video_suggestion: string
  audio_suggestion: string | null
  question: string
  audio_url: string | null 
  personaL_notes?: string
  status: string
}

export function toAnswerResponse(answer: Answer): AnswerResponse {
  return {
    id: answer.id,
    question_id: answer.question_id,
    audio_url: answer.audio_url,
    score: answer.score,
    suggestion: answer.suggestion,
    createdAt: answer.createdAt,
  }
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
  }
}

export function toQuestionResponse(question: Question, answer?: Answer): QuestionResponse {
  return {
    id: question.id,
    presentation_id: question.presentation_id,
    question: question.question,
    time_limit_seconds: question.time_limit_seconds,
    answer: answer ? toAnswerResponse(answer) : undefined,
    createdAt: question.createdAt,
  }
}

export function toFinalFeedbackResponse(
  feedback: Feedback, 
  questionText: string, 
  audioUrl: string | null
): FinalFeedbackResponse {
  return {
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
    question: questionText,
    audio_url: audioUrl, 
    status: "COMPLETED"
  }
}