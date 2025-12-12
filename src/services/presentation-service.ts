import { CreatePresentationRequest, PresentationAnalysisResponse, PresentationResponse, FinalFeedbackResponse } from "../models/presentation-model"
import { prismaClient } from "../utils/database-util"
import { analyzeVideoWithGemini, analyzeAudioAnswerWithGemini } from "../utils/gemini-util"
import { PresentationValidation } from "../validations/presentation-validation"
import { Validation } from "../validations/validation"

export class PresentationService {
    static async create(request: CreatePresentationRequest, videoPath?: string): Promise<PresentationResponse> {
        const validation = Validation.validate(PresentationValidation.CREATE, request)
        const presentation = await prismaClient.presentation.create({
            data: {
                user_id: validation.user_id,
                video_url: validation.video_url,
                status: "ONGOING",
                title: validation.title || "Untitled Presentation"
            }
        })

        if (videoPath) {
            this.processVideoWithGemini(presentation.id, videoPath).catch(err => {
                console.error("Background processing failed:", err)
            })
        }

        return {
            id: presentation.id,
            title: presentation.title,
            video_url: presentation.video_url,
            status: "ONGOING" 
        }
    }

    static async getAnalysis(presentationId: number): Promise<PresentationAnalysisResponse> {
        const feedback = await prismaClient.feedbacks.findFirst({
            where: { presentation_id: presentationId }
        })

        const questions = await prismaClient.question.findMany({
            where: { presentation_id: presentationId }
        })

        const presentation = await prismaClient.presentation.findUnique({
            where: { id: presentationId }
        })


        return {
            status: presentation?.status || "UNKNOWN",
            feedback: feedback,
            questions: questions
        }
    }

    static async submitAnswer(questionId: number, audioPath: string) {
        const validation = Validation.validate(PresentationValidation.SUBMIT_ANSWER, { questionId, audioPath })

        const questionData = await prismaClient.question.findUnique({
            where: { id: validation.questionId }
        })

        if (!questionData) throw new Error("Question not found")

        const analysis = await analyzeAudioAnswerWithGemini(validation.audioPath, questionData.question)

        const savedAnswer = await prismaClient.answer.create({
            data: {
                question_id: validation.questionId,
                audio_url: validation.audioPath,
                score: analysis.score,
            }
        })
        
        return savedAnswer
    }
    
    static async update(presentationId: number, title: string, status: "ONGOING" | "COMPLETED" | "FAILED") {
        const validation = Validation.validate(PresentationValidation.UPDATE, { id: presentationId, title, status })
        const check = await prismaClient.presentation.findUnique({ where: { id: validation.id } })
        if (!check) throw new Error("Presentation not found")

        const updated = await prismaClient.presentation.update({
            where: { id: validation.id },
            data: { 
                title: validation.title,
                status: validation.status
             }
        })
        return updated
    }

    static async delete(presentationId: number) {
        const check = await prismaClient.presentation.findUnique({ where: { id: presentationId } })
        if (!check) throw new Error("Presentation not found")

        await prismaClient.presentation.delete({
            where: { id: presentationId }
        })
        
        return "Presentation deleted successfully"
    }

    private static async processVideoWithGemini(presentationId: number, videoPath: string): Promise<void> {
        try {
            console.log(`[Background] Start analyzing presentation #${presentationId}`)
            const analysis = await analyzeVideoWithGemini(videoPath)

            await prismaClient.$transaction(async (tx) => {
                await tx.feedbacks.create({
                    data: {
                        presentation_id: presentationId,
                        expression: analysis.expression,
                        intonation: analysis.intonation,
                        posture: analysis.posture,
                        overall_rating: Number(analysis.overall_rating),
                        suggestion: analysis.suggestion
                    }
                })

                if (analysis.questions.length > 0) {
                    await tx.question.createMany({
                        data: analysis.questions.map(q => ({
                            presentation_id: presentationId,
                            question: q
                        }))
                    })
                }

                await tx.presentation.update({
                    where: { id: presentationId },
                    data: { status: "COMPLETED" }
                })
            })
            console.log(`[Background] Success analyzing presentation #${presentationId}`)
        } catch (error) {
            console.error(`[Background] Failed analyzing presentation #${presentationId}:`, error)
            await prismaClient.presentation.update({
                where: { id: presentationId },
                data: { status: "FAILED" }
            })
        }
    }
}