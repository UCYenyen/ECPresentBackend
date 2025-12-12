export interface FeedbackResponse {
  id: number
  presentation_id: number
  expression: number
  intonation: number
  posture: number
  overall_rating: number // Float di DB = number di TS
  suggestion?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateFeedbackRequest {
  presentation_id: number
  expression: number
  intonation: number
  posture: number
  overall_rating: number // Float di DB = number di TS
  suggestion?: string
}