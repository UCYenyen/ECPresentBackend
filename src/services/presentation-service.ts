import { PrismaClient } from "@prisma/client"
import { CreatePresentationRequest, PresentationAnalysisResponse, PresentationResponse } from "../models/presentation-model"
import { prismaClient } from "../utils/database-util"
import { analyzeVideoWithGemini } from "../utils/gemini-util"
import fs from "fs"

export class PresentationService {
    static async create(request: CreatePresentationRequest, videoPath?: string): Promise<PresentationResponse> {
        const presentation = await prismaClient.presentation.create({
            data: {
                user_id: request.user_id,
                video_url: request.video_url,
                status: "ONGOING",
                title: request.title
            }
        })

        // Process video with Gemini AI synchronously (tunggu hingga selesai)
        if (videoPath) {
            await this.processVideoWithGemini(presentation.id, videoPath)
        }

        // Get updated presentation with COMPLETED status
        const updatedPresentation = await prismaClient.presentation.findUnique({
            where: { id: presentation.id }
        })

        return {
            id: presentation.id,
            title: presentation.title,
            video_url: presentation.video_url,
            status: updatedPresentation?.status || "COMPLETED"
        }
    }

    static async getAnalysis(presentationId: number): Promise<PresentationAnalysisResponse> {
        const feedback = await prismaClient.feedbacks.findFirst({
            where: { presentation_id: presentationId }
        })

        const questions = await prismaClient.question.findMany({
            where: { presentation_id: presentationId }
        })

        return {
            feedback: feedback,
            questions: questions
        }
    }

    private static async processVideoWithGemini(presentationId: number, videoPath: string): Promise<void> {
        try {
            console.log(`Processing video for presentation ${presentationId}...`)

            // Analyze video with Gemini - AWAIT disini agar tunggu sampai selesai
            const analysis = await analyzeVideoWithGemini(videoPath)

            console.log(`Analysis result:`, analysis)

            // Save feedback to database
            await prismaClient.feedbacks.create({
                data: {
                    presentation_id: presentationId,
                    expression: analysis.expression,
                    intonation: analysis.intonation,
                    posture: analysis.posture,
                    overall_rating: analysis.overall_rating,
                    suggestion: analysis.suggestion
                }
            })

            // Save questions to database
            for (const q of analysis.questions) {
                await prismaClient.question.create({
                    data: {
                        presentation_id: presentationId,
                        question: q
                    }
                })
            }

            // Update presentation status to COMPLETED
            await prismaClient.presentation.update({
                where: { id: presentationId },
                data: { status: "COMPLETED" }
            })

            // Delete video file after processing
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath)
            }

            console.log(`Successfully processed presentation ${presentationId}`)
        } catch (error) {
            console.error(`Error processing video for presentation ${presentationId}:`, error)
            
            // Update status to indicate error
            await prismaClient.presentation.update({
                where: { id: presentationId },
                data: { status: "ONGOING" }
            })
            
            throw error
        }
    }
}