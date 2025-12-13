import { prismaClient } from "../utils/database-util"
import { FinalFeedbackResponse } from "../models/presentation-model"
import { ResponseError } from "../error/response-error"

export class FeedbackService {
    
    private static async checkOwnership(presentationId: number, userId: number) {
        const presentation = await prismaClient.presentation.findFirst({
            where: { 
                id: presentationId, 
                user_id: userId 
            }
        })

        if (!presentation) {
            throw new ResponseError(404, "Presentation not found or access denied")
        }
        return presentation
    }

    static async generateFinalFeedback(presentationId: number, userId: number): Promise<FinalFeedbackResponse> {
        await this.checkOwnership(presentationId, userId)

        const videoFeedback = await prismaClient.feedback.findFirst({
            where: { presentation_id: presentationId }
        })

        if (!videoFeedback) {
            throw new ResponseError(404, "Video feedback not found. Analysis may not be ready yet.")
        }

        const answer = await prismaClient.answer.findFirst({
            where: {
                question: { presentation_id: presentationId }
            },
            include: { question: true }
        })

        const audioScore = answer?.score ?? 0
        const videoScore = videoFeedback.video_score ?? 0
        const finalScore = (Number(videoScore) + audioScore) / 2

        let finalGrade = "E"
        if (finalScore >= 90) finalGrade = "S"
        else if (finalScore >= 80) finalGrade = "A"
        else if (finalScore >= 70) finalGrade = "B"
        else if (finalScore >= 60) finalGrade = "C"
        else if (finalScore >= 50) finalGrade = "D"

        const audioSuggestion = answer?.suggestion || "No audio feedback available."

        await prismaClient.feedback.update({
            where: { id: videoFeedback.id },
            data: {
                audio_score: parseFloat(audioScore.toFixed(2)),
                audio_suggestion: audioSuggestion,
                overall_rating: Math.round(finalScore),
                grade: finalGrade
            }
        })

        await prismaClient.presentation.update({
            where: { id: presentationId },
            data: { status: "COMPLETED" }
        })

        return {
            presentation_id: presentationId,
            expression: videoFeedback.expression,
            intonation: videoFeedback.intonation,
            posture: videoFeedback.posture,
            video_score: videoFeedback.video_score,
            audio_score: parseFloat(audioScore.toFixed(2)),
            overall_score: Math.round(finalScore),
            grade: finalGrade,
            video_suggestion: videoFeedback.video_suggestion,
            audio_suggestion: audioSuggestion,
            question: answer?.question.question || "No question available",
            answer_audio_url: answer?.audio_url || null,
            status: "COMPLETED"
        }
    }

    static async getByPresentationId(presentationId: number, userId: number) {
        await this.checkOwnership(presentationId, userId)
        const feedback = await prismaClient.feedback.findFirst({
            where: { presentation_id: presentationId }
        })

        if (!feedback) {
            throw new ResponseError(404, "Feedback not found")
        }

        return feedback
    }
}