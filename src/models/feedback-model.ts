import e from "express"

export interface FeedbackResponse {
  id: number
  presentation_id: number
  expression: number
  intonation: number
  posture: number
  overall_rating: string
  suggestion?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateFeedbackRequest {
  presentation_id: number
  expression: number
  intonation: number
  posture: number
  overall_rating: string
  suggestion?: string
}