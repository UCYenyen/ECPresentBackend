import { prismaClient } from "../utils/database-util"
import { FinalFeedbackResponse } from "../models/presentation-model"   


export class FeedbackService{
    static async generateFinalFeedback(presentationId: number): Promise<FinalFeedbackResponse> {
            const videoFeedback = await prismaClient.feedbacks.findFirst({
                where: { presentation_id: presentationId }
            })
    
            if (!videoFeedback) throw new Error("Video analysis not ready or failed")
    
            const answers = await prismaClient.answer.findMany({
                where: {
                    question: { presentation_id: presentationId }
                },
                include: { question: true }
            })
            let totalAudioScore = 0
            answers.forEach(a => {
                totalAudioScore += (a.score ?? 0) 
            })
            
            const avgAudioScore = answers.length > 0 ? (totalAudioScore / answers.length) : 0
            const videoScore = videoFeedback.overall_rating ?? 0
            const finalScore = (Number(videoScore) * 0.6) + (avgAudioScore * 0.4)
    
            return {
                presentation_id: presentationId,
                video_feedback: videoFeedback,
                answers_summary: answers,
                average_audio_score: parseFloat(avgAudioScore.toFixed(2)),
                final_calculated_score: Math.round(finalScore),
                status: "COMPLETED"
            }
        }
    
}