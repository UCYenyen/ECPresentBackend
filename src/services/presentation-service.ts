import { ClientMetricsRequest, CreatePresentationRequest, PresentationAnalysisResponse, PresentationResponse, VideoUploadMeta, toPresentationResponse } from "../models/presentation-model"
import { prismaClient } from "../utils/database-util"
import {
    analyzeVideoWithGemini,
    analyzeAudioAnswerWithGemini,
    deleteGeminiFile,
    GeminiFileRef,
    VideoAnalysisOutcome,
    QNA_MODEL_NAME,
    VIDEO_MODEL_NAME
} from "../utils/gemini-util"
import { PresentationValidation } from "../validations/presentation-validation"
import { Validation } from "../validations/validation"
import { ResponseError } from "../error/response-error"
import { PIPELINE_CONFIG } from "../utils/pipeline-config"
import { ProcessingTracker } from "../utils/processing-tracker"
import { PipelineError, isTimeoutError, toPipelineError } from "../utils/resilience-util"
import fs from 'fs'

// Pesan kegagalan yang aman ditampilkan ke user
function toFailureReason(error: unknown): string {
    if (!(error instanceof PipelineError)) return "The AI analysis failed. Please upload your video again."
    if (error.isTimeout) return "The AI analysis took too long and was stopped. Please try again, or upload a shorter video."
    switch (error.stage) {
        case "UPLOAD": return "The video could not be sent to the AI service. Please check your connection and try again."
        case "FILE_ACTIVE": return "The AI service could not process this video. Please try another video format."
        case "GENERATE":
        case "PARSE": return "The AI service is busy or returned an invalid result. Please try again in a moment."
        default: return "The AI analysis failed. Please upload your video again."
    }
}

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

    static async create(request: CreatePresentationRequest, videoPath?: string, meta?: VideoUploadMeta): Promise<PresentationResponse> {
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
                this.processVideoWithGemini(presentation.id, videoPath, meta).catch(err => {
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

        const log = await prismaClient.processingLog.findFirst({
            where: { presentation_id: presentation.id, kind: "VIDEO" },
            orderBy: { id: "desc" },
            select: { status: true, current_stage: true, upload_attempts: true, generate_attempts: true, pipeline_mode: true }
        })

        return {
            status: presentation.status,
            failure_reason: presentation.failure_reason,
            feedback: feedback,
            question: question,
            processing: log ? {
                status: log.status,
                stage: log.current_stage,
                upload_attempts: log.upload_attempts,
                generate_attempts: log.generate_attempts,
                pipeline_mode: log.pipeline_mode
            } : null
        }
    }

    static async saveClientMetrics(presentationId: number, userId: number, request: ClientMetricsRequest) {
        const validation = Validation.validate(PresentationValidation.CLIENT_METRICS, request)
        await this.checkOwnership(presentationId, userId)

        const log = await prismaClient.processingLog.findFirst({
            where: { presentation_id: presentationId, kind: "VIDEO" },
            orderBy: { id: "desc" }
        })
        if (!log) throw new ResponseError(404, "Processing log not found for this presentation")

        await prismaClient.processingLog.update({
            where: { id: log.id },
            data: validation
        })

        return { processing_log_id: log.id }
    }
    
    static async submitAnswer(
        presentationId: number, 
        audioPath: string, 
        userId: number, 
    ) {
        const validation = Validation.validate(PresentationValidation.SUBMIT_ANSWER, { 
            presentationId,
            audioPath
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

        const presentation = questionData.presentation
        const reusableVideoFile: GeminiFileRef | undefined =
            PIPELINE_CONFIG.reuseGeminiFileForQna && presentation.gemini_file_name && presentation.gemini_file_uri
                ? {
                    name: presentation.gemini_file_name,
                    uri: presentation.gemini_file_uri,
                    mimeType: presentation.gemini_file_mime || "video/mp4",
                    expiresAt: presentation.gemini_file_expires_at ?? undefined
                }
                : undefined

        // Durasi video presentasi ikut dicatat agar tahap ANSWER bisa dikelompokkan per durasi
        const videoLog = await prismaClient.processingLog.findFirst({
            where: { presentation_id: presentation.id, kind: "VIDEO" },
            orderBy: { id: "desc" },
            select: { video_duration_sec: true }
        })
        const tracker = await ProcessingTracker.start({
            kind: "ANSWER",
            presentationId: presentation.id,
            sampleLabel: presentation.title,
            fileSizeBytes: fs.existsSync(audioPath) ? fs.statSync(audioPath).size : undefined,
            videoDurationSec: videoLog?.video_duration_sec ?? undefined,
            model: QNA_MODEL_NAME
        })

        try {
            const analysis = await analyzeAudioAnswerWithGemini(
                validation.audioPath, 
                questionData.question, 
                tracker,
                presentation.video_url,
                reusableVideoFile
            )

            await tracker.setStage("SAVING")

            const savedAnswer = await prismaClient.answer.create({
                data: {
                    question_id: questionData.id,
                    audio_url: validation.audioPath,
                    score: analysis.score,
                    suggestion: analysis.suggestion 
                }
            })

            await tracker.finish(tracker.hasFailure ? "FALLBACK" : "SUCCESS")

            // Jawaban hanya bisa dikirim sekali, jadi file video di Gemini tidak dibutuhkan lagi
            if (reusableVideoFile) {
                await deleteGeminiFile(reusableVideoFile.name)
                await prismaClient.presentation.update({
                    where: { id: presentation.id },
                    data: { gemini_file_name: null, gemini_file_uri: null, gemini_file_mime: null, gemini_file_expires_at: null }
                }).catch(() => {})
            }

            return savedAnswer

        } catch (error) {
            console.error("Failed to analyze audio:", error)
            await tracker.finish(isTimeoutError(error) ? "TIMEOUT" : "FAILED", toPipelineError(error, "SAVE"))
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
            throw new ResponseError(500, "AI Analysis failed")
        }
    }

    static async getAverageScores(userId: number) {
        const validation = Validation.validate(PresentationValidation.GET_AVERAGE, 
            { userId: userId })
        const aggregations = await prismaClient.feedback.aggregate({
            where: { 
                presentation: {
                    user_id: validation.userId
                }
            },
            _avg: {
                intonation: true,
                expression: true,
                posture: true
            }
        })
        
        const formatScore = (score: number | null) => parseFloat((score || 0).toFixed(2));

        return {
        
                average_intonation: formatScore(aggregations._avg.intonation),
                average_expression: formatScore(aggregations._avg.expression),
                average_posture: formatScore(aggregations._avg.posture)
        
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

        if (presentation.gemini_file_name) {
            await deleteGeminiFile(presentation.gemini_file_name)
        }

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

    static async updateNotes(userId: number, presentationId: number, notes: string) {
        await this.checkOwnership(presentationId, userId);

        const updatedPresentation = await prismaClient.presentation.update({
            where: { id: presentationId },
            data: { personal_notes: notes }
        });

        return toPresentationResponse(updatedPresentation);

    }

    private static async processVideoWithGemini(presentationId: number, videoPath: string, meta?: VideoUploadMeta): Promise<void> {
        const tracker = await ProcessingTracker.start({
            kind: "VIDEO",
            presentationId,
            sampleLabel: meta?.sampleLabel,
            experimentLabel: meta?.experimentLabel,
            fileSizeBytes: meta?.fileSizeBytes,
            videoDurationSec: meta?.videoDurationSec,
            mimeType: meta?.mimeType,
            model: VIDEO_MODEL_NAME,
            requestReceivedAt: meta?.requestReceivedAt,
            fileStoredAt: meta?.fileStoredAt
        })
        let outcome: VideoAnalysisOutcome | undefined

        try {
            console.log(`[Background] Start analyzing presentation #${presentationId}`)
            outcome = await tracker.runWithDeadline(
                PIPELINE_CONFIG.processingDeadlineMs,
                () => analyzeVideoWithGemini(videoPath, tracker)
            )
            const { analysis, retainedFile } = outcome

            await tracker.setStage("SAVING")
            await tracker.timed("SAVE", 1, "save_ms", () => prismaClient.$transaction(async (tx) => {
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
                    data: {
                        status: "ONGOING",
                        gemini_file_name: retainedFile?.name,
                        gemini_file_uri: retainedFile?.uri,
                        gemini_file_mime: retainedFile?.mimeType,
                        gemini_file_expires_at: retainedFile?.expiresAt
                    }
                })
            }))

            await tracker.finish(outcome.isFallback ? "FALLBACK" : "SUCCESS")
            console.log(`[Background] Success analyzing presentation #${presentationId}`)
        } catch (error) {
            console.error(`[Background] Failed analyzing presentation #${presentationId}:`, error)
            const pipelineError = toPipelineError(error, "SAVE")
            if (outcome?.retainedFile) await deleteGeminiFile(outcome.retainedFile.name)
            await tracker.finish(pipelineError.isTimeout ? "TIMEOUT" : "FAILED", pipelineError)
            await prismaClient.presentation.update({
                where: { id: presentationId },
                data: { status: "FAILED", failure_reason: toFailureReason(pipelineError) }
            }).catch(e => console.error(`[Background] Failed to mark presentation #${presentationId} as FAILED:`, e))
        }
    }
}