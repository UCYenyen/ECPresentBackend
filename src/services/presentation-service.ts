import { CreatePresentationRequest, PresentationAnalysisResponse, PresentationResponse, FinalFeedbackResponse } from "../models/presentation-model"
import { prismaClient } from "../utils/database-util"
import { analyzeVideoWithGemini, analyzeAudioAnswerWithGemini } from "../utils/gemini-util"

export class PresentationService {
    
    // --- 1. CREATE PRESENTATION ---
    static async create(request: CreatePresentationRequest, videoPath?: string): Promise<PresentationResponse> {
        const presentation = await prismaClient.presentation.create({
            data: {
                user_id: request.user_id,
                video_url: request.video_url,
                status: "ONGOING",
                title: request.title
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

    // --- 2. GET ANALYSIS (SECURE BLUR) ---
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

        const blurredQuestions = questions.map(q => ({
            ...q, 
            question: this.scrambleText(q.question) 
        }))

        return {
            status: presentation?.status || "UNKNOWN",
            feedback: feedback,
            questions: blurredQuestions 
        }
    }

    // --- 3. GET ORIGINAL QUESTION (REVEAL) ---
    static async getOriginalQuestion(questionId: number) {
        const question = await prismaClient.question.findUnique({
            where: { id: questionId }
        })

        if (!question) throw new Error("Question not found")
        
        return question 
    }

    // --- 4. SUBMIT ANSWER (AUDIO) ---
    static async submitAnswer(questionId: number, audioPath: string) {
        const questionData = await prismaClient.question.findUnique({
            where: { id: questionId }
        })

        if (!questionData) throw new Error("Question ID not found")

        const analysis = await analyzeAudioAnswerWithGemini(audioPath, questionData.question)

        const savedAnswer = await prismaClient.answer.create({
            data: {
                question_id: questionId,
                audio_url: audioPath,
                score: analysis.score,
                feedback: analysis.feedback,
                is_relevant: analysis.is_relevant
            }
        })
        
        return savedAnswer
    }

    // --- 5. GENERATE FINAL FEEDBACK ---
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

        // --- PERBAIKAN DI SINI ---
        // Menggunakan (a.score || 0) atau (a.score ?? 0) untuk handle null
        let totalAudioScore = 0
        answers.forEach(a => {
            totalAudioScore += (a.score ?? 0) 
        })
        
        const avgAudioScore = answers.length > 0 ? (totalAudioScore / answers.length) : 0

        // Handle juga jika overall_rating null (jaga-jaga)
        const videoScore = videoFeedback.overall_rating ?? 0

        // Kalkulasi Skor Akhir
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

    // --- 6. UPDATE TITLE ---
    static async update(presentationId: number, title: string) {
        const check = await prismaClient.presentation.findUnique({ where: { id: presentationId } })
        if (!check) throw new Error("Presentation not found")

        const updated = await prismaClient.presentation.update({
            where: { id: presentationId },
            data: { title: title }
        })
        return updated
    }

    // --- 7. DELETE PRESENTATION ---
    static async delete(presentationId: number) {
        const check = await prismaClient.presentation.findUnique({ where: { id: presentationId } })
        if (!check) throw new Error("Presentation not found")

        await prismaClient.presentation.delete({
            where: { id: presentationId }
        })
        
        return "Presentation deleted successfully"
    }

    // --- HELPER PRIVATE ---
    private static scrambleText(text: string): string {
        const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return text.split('').map(char => {
            if (char === ' ' || char === '?' || char === '.') return char;
            return characters.charAt(Math.floor(Math.random() * characters.length));
        }).join('');
    }

    // --- BACKGROUND PROCESS ---
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