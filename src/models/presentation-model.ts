import { Presentation, Feedbacks, Question } from "@prisma/client"

export interface CreatePresentationRequest {
    title: string
    user_id: number
    video_url: string
}

export interface PresentationResponse {
    id: number
    title: string
    video_url: string
    status: string
}

export interface PresentationAnalysisResponse {
    feedback: Feedbacks | null
    questions: Question[]
}