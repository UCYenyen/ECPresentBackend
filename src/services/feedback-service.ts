import { prismaClient } from "../utils/database-util"
import { FinalFeedbackResponse } from "../models/presentation-model"
import { ResponseError } from "../error/response-error"

export class FeedbackService {
    static async generateFinalFeedback(presentationId: number): Promise<FinalFeedbackResponse> {
        const videoFeedback = await prismaClient.feedback.findFirst({
            where: { presentation_id: presentationId }
        })

        if (!videoFeedback) {
            throw new ResponseError(404, "Video feedback not found. Analysis may not be ready yet.")
        }

        const answers = await prismaClient.answer.findMany({
            where: {
                question: { presentation_id: presentationId }
            },
            include: { question: true }
        })

        let totalAudioScore = 0
        const audioSuggestions: string[] = []

        answers.forEach(a => {
            totalAudioScore += (a.score ?? 0)
            if (a.analysis && typeof a.analysis === 'object') {
                const analysisObj = a.analysis as any
                if (analysisObj.suggestion) {
                    audioSuggestions.push(analysisObj.suggestion)
                }
            }
        })
        
        const avgAudioScore = answers.length > 0 ? (totalAudioScore / answers.length) : 0
        const videoScore = videoFeedback.video_score ?? 0
        const finalScore = (Number(videoScore) +avgAudioScore )/2

        let finalGrade = "E"
        if (finalScore >= 90) finalGrade = "S"
        else if (finalScore >= 80) finalGrade = "A"
        else if (finalScore >= 70) finalGrade = "B"
        else if (finalScore >= 60) finalGrade = "C"
        else if (finalScore >= 50) finalGrade = "D"

        const combinedAudioSuggestion = audioSuggestions.length > 0 
            ? audioSuggestions.join(" ") 
            : "No audio feedback available.";

        const updatedFeedback = await prismaClient.feedback.update({
            where: { id: videoFeedback.id },
            data: {
                audio_score: parseFloat(avgAudioScore.toFixed(2)),
                audio_suggestion: combinedAudioSuggestion,
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
            video_feedback: updatedFeedback,
            answers_summary: answers,
            average_audio_score: parseFloat(avgAudioScore.toFixed(2)),
            final_calculated_score: Math.round(finalScore),
            status: "COMPLETED"
        }
    }

    static async getByPresentationId(presentationId: number) {
        const feedback = await prismaClient.feedback.findFirst({
            where: { presentation_id: presentationId }
        })

        if (!feedback) {
            throw new ResponseError(404, "Feedback not found")
        }

        return feedback
    }
}