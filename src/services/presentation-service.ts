import { CreatePresentationRequest, PresentationAnalysisResponse, PresentationResponse, toPresentationResponse } from "../models/presentation-model"
import { prismaClient } from "../utils/database-util"
import { analyzeVideoWithGemini, analyzeAudioAnswerWithGemini } from "../utils/gemini-util"
import { PresentationValidation } from "../validations/presentation-validation"
import { Validation } from "../validations/validation"
import { ResponseError } from "../error/response-error"
import fs from 'fs'

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

        return toPresentationResponse(presentation)
    }

    static async getAnalysis(presentationId: number): Promise<PresentationAnalysisResponse> {
        const presentation = await prismaClient.presentation.findUnique({
            where: { id: presentationId }
        })

        if (!presentation) throw new ResponseError(404, "Presentation not found")

        const feedback = await prismaClient.feedback.findFirst({
            where: { presentation_id: presentationId }
        })

        const questions = await prismaClient.question.findMany({
            where: { presentation_id: presentationId }
        })

        return {
            status: presentation.status,
            feedback: feedback,
            questions: questions
        }
    }

    static async submitAnswer(questionId: number, audioPath: string, mimeType: string) {
        const validation = Validation.validate(PresentationValidation.SUBMIT_ANSWER, { 
            questionId, 
            audioPath 
        })

        const questionData = await prismaClient.question.findUnique({
            where: { id: validation.questionId }
        })

        if (!questionData) {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw new ResponseError(404, "Question not found")
        }

        try {
            const analysis = await analyzeAudioAnswerWithGemini(
                validation.audioPath, 
                questionData.question,
                mimeType
            )

            const savedAnswer = await prismaClient.answer.create({
                data: {
                    question_id: validation.questionId,
                    audio_url: validation.audioPath,
                    score: analysis.score,
                    analysis: analysis.analysis as any
                }
            })

            console.log(`[Info] Audio file kept for history: ${audioPath}`)
            return savedAnswer
        } catch (error) {
            console.error("Failed to analyze audio:", error)
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw error
        }
    }

    static async getById(presentationId: number): Promise<PresentationResponse> {
        const presentation = await prismaClient.presentation.findUnique({
            where: { id: presentationId }
        })

        if (!presentation) throw new ResponseError(404, "Presentation not found")

        return toPresentationResponse(presentation)
    }

    static async list(userId: number): Promise<PresentationResponse[]> {
        const presentations = await prismaClient.presentation.findMany({
            where: { user_id: userId },
            orderBy: { createdAt: 'desc' }
        })

        return presentations.map(toPresentationResponse)
    }

    static async update(presentationId: number, title?: string, status?: "ONGOING" | "COMPLETED" | "FAILED") {
        const validation = Validation.validate(PresentationValidation.UPDATE, { 
            id: presentationId, 
            title, 
            status 
        })
        
        const check = await prismaClient.presentation.findUnique({ 
            where: { id: validation.id } 
        })
        
        if (!check) throw new ResponseError(404, "Presentation not found")

        const updated = await prismaClient.presentation.update({
            where: { id: validation.id },
            data: { 
                title: validation.title,
                status: validation.status
            }
        })
        
        return toPresentationResponse(updated)
    }

    static async delete(presentationId: number): Promise<string> {
        const presentation = await prismaClient.presentation.findUnique({ 
            where: { id: presentationId },
            include: {
                questions: {
                    include: {
                        answers: true
                    }
                }
            }
        })
        
        if (!presentation) throw new ResponseError(404, "Presentation not found")

        if (presentation.video_url && fs.existsSync(presentation.video_url)) {
            try {
                fs.unlinkSync(presentation.video_url)
                console.log(`[Cleanup] Video deleted: ${presentation.video_url}`)
            } catch (error) {
                console.error(`[Cleanup] Failed to delete video: ${error}`)
            }
        }
        presentation.questions.forEach(q => {
            q.answers.forEach(a => {
                if (a.audio_url && fs.existsSync(a.audio_url)) {
                    try {
                        fs.unlinkSync(a.audio_url)
                        console.log(`[Cleanup] Audio deleted: ${a.audio_url}`)
                    } catch (error) {
                        console.error(`[Cleanup] Failed to delete audio: ${error}`)
                    }
                }
            })
        })
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
                await tx.feedback.create({
                    data: {
                        presentation_id: presentationId,
                        expression: analysis.expression,
                        intonation: analysis.intonation,
                        posture: analysis.posture,
                        video_score: analysis.video_score,
                        audio_score: 0,
                        audio_suggestion: null,
                        overall_rating: analysis.overall_score,
                        grade: analysis.grade,
                        video_suggestion: analysis.suggestion
                    }
                })

                if (analysis.questions && analysis.questions.length > 0) {
                    await tx.question.createMany({
                        data: analysis.questions.map(q => ({
                            presentation_id: presentationId,
                            question: q,
                            time_limit_seconds: 60
                        }))
                    })
                }

                await tx.presentation.update({
                    where: { id: presentationId },
                    data: { status: "COMPLETED" }
                })
            })

            console.log(`[Background] Success analyzing presentation #${presentationId}`)
            console.log(`[Info] Video file kept for history: ${videoPath}`)
        } catch (error) {
            console.error(`[Background] Failed analyzing presentation #${presentationId}:`, error)
            
            await prismaClient.presentation.update({
                where: { id: presentationId },
                data: { status: "FAILED" }
            })
        }
    }
}