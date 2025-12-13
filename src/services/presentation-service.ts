import { CreatePresentationRequest, PresentationAnalysisResponse, PresentationResponse, toPresentationResponse } from "../models/presentation-model"
import { prismaClient } from "../utils/database-util"
import { analyzeVideoWithGemini, analyzeAudioAnswerWithGemini } from "../utils/gemini-util"
import { PresentationValidation } from "../validations/presentation-validation"
import { Validation } from "../validations/validation"
import { ResponseError } from "../error/response-error"
import fs from 'fs'

export class PresentationService {
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

    static async create(request: CreatePresentationRequest, videoPath?: string): Promise<PresentationResponse> {
        const validation = Validation.validate(PresentationValidation.CREATE, request)
        try {
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
        } catch (error) {
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath)
            }
            throw error
        }  
    }

    static async getAnalysis(presentationId: number, userId: number): Promise<PresentationAnalysisResponse> {
        const presentation = await this.checkOwnership(presentationId, userId)

        const feedback = await prismaClient.feedback.findFirst({
            where: { presentation_id: presentation.id }
        })

        const question = await prismaClient.question.findUnique({
            where: { presentation_id: presentation.id },
            include: {
                answer: true 
            }
        })

        return {
            status: presentation.status,
            feedback: feedback,
            question: question
        }
    }
    
    static async submitAnswer(
        presentationId: number, 
        audioPath: string, 
        userId: number,
        questionText: string 
    ) {
        const validation = Validation.validate(PresentationValidation.SUBMIT_ANSWER, { 
            presentationId,
            audioPath,
            questionText
        })

        const questionData = await prismaClient.question.findUnique({
            where: {
                presentation_id: validation.presentationId
            },
            include: { 
                presentation: true,
                answer: true
            }
        })

        if (!questionData) {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw new ResponseError(404, `Question not found for this presentation`)
        }

        if (questionData.presentation.user_id !== userId) {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw new ResponseError(403, "Access denied")
        }

        if (questionData.answer) {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw new ResponseError(400, "You have already answered this question.")
        }

        try {
            const analysis = await analyzeAudioAnswerWithGemini(
                validation.audioPath, 
                questionData.question, 
                questionData.presentation.video_url
            )

            const savedAnswer = await prismaClient.answer.create({
                data: {
                    question_id: questionData.id,
                    audio_url: validation.audioPath,
                    score: analysis.score,
                    suggestion: analysis.suggestion 
                }
            })

            return savedAnswer

        } catch (error) {
            console.error("Failed to analyze audio:", error)
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw new ResponseError(500, "AI Analysis failed")
        }
    }

    static async getById(presentationId: number, userId: number): Promise<PresentationResponse> {
        const presentation = await this.checkOwnership(presentationId, userId)
        return toPresentationResponse(presentation)
    }

    static async list(userId: number): Promise<PresentationResponse[]> {
        const presentations = await prismaClient.presentation.findMany({
            where: { user_id: userId },
            orderBy: { createdAt: 'desc' }
        })

        return presentations.map(toPresentationResponse)
    }

    static async update(presentationId: number, userId: number, title?: string, status?: "ONGOING" | "COMPLETED" | "FAILED") {
        const validation = Validation.validate(PresentationValidation.UPDATE, { 
            id: presentationId, 
            title, 
            status 
        })
        
        await this.checkOwnership(presentationId, userId)

        const updated = await prismaClient.presentation.update({
            where: { id: validation.id },
            data: { 
                title: validation.title,
                status: validation.status
            }
        })
        
        return toPresentationResponse(updated)
    }

    static async delete(presentationId: number, userId: number): Promise<string> {
        const presentation = await prismaClient.presentation.findFirst({ 
            where: { 
                id: presentationId,
                user_id: userId 
            },
            include: {
                question: {
                    include: {
                        answer: true
                    }
                }
            }
        })
        
        if (!presentation) throw new ResponseError(404, "Presentation not found or access denied")

        if (presentation.video_url && fs.existsSync(presentation.video_url)) {
            try {
                fs.unlinkSync(presentation.video_url)
                console.log(`[Cleanup] Video deleted: ${presentation.video_url}`)
            } catch (error) {
                console.error(`[Cleanup] Failed to delete video: ${error}`)
            }
        }

        if (presentation.question?.answer?.audio_url) {
            const audioPath = presentation.question.answer.audio_url
            if (fs.existsSync(audioPath)) {
                try {
                    fs.unlinkSync(audioPath)
                    console.log(`[Cleanup] Audio deleted: ${audioPath}`)
                } catch (error) {
                    console.error(`[Cleanup] Failed to delete audio: ${error}`)
                }
            }
        }
        
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
                        overall_rating: analysis.overall_score,
                        grade: analysis.grade,
                        video_suggestion: analysis.suggestion,
                        audio_suggestion: null 
                    }
                })

                if (analysis.question) {
                    await tx.question.create({
                        data: {
                            presentation_id: presentationId,
                            question: analysis.question,
                            time_limit_seconds: 60
                        }
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