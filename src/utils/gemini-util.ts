import { GoogleGenerativeAI, Part } from "@google/generative-ai"
import { GoogleAIFileManager, FileState, FileMetadataResponse } from "@google/generative-ai/server"
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_QNA_MODEL } from "./env-util"
import { VideoAnalysisResult, AudioAnalysisResult } from "../models/feedback-model"
import { PIPELINE_CONFIG } from "./pipeline-config"
import { ProcessingTracker } from "./processing-tracker"
import {
    PipelineError,
    PipelineStage,
    backoffDelay,
    errorMessage,
    isRetryableError,
    retryAfterMs,
    sleep,
    toPipelineError,
    withTimeout,
} from "./resilience-util"
import path from "path"
import fs from "fs"

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "")
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY || "")
// SDK hanya menerima timeout upload di level manager, jadi dibuat manager terpisah untuk upload
const uploadFileManager = PIPELINE_CONFIG.uploadTimeoutMs > 0
    ? new GoogleAIFileManager(GEMINI_API_KEY || "", { timeout: PIPELINE_CONFIG.uploadTimeoutMs })
    : fileManager

const MAX_SERVER_RETRY_DELAY_MS = 90_000

export const VIDEO_MODEL_NAME = GEMINI_MODEL || "gemini-2.0-flash-exp"
export const QNA_MODEL_NAME = GEMINI_QNA_MODEL || "gemini-2.0-flash"

export interface GeminiFileRef {
    name: string
    uri: string
    mimeType: string
    expiresAt?: Date
}

export interface VideoAnalysisOutcome {
    analysis: VideoAnalysisResult
    // true = hasil mock karena error ditutupi (perilaku baseline)
    isFallback: boolean
    // file video yang sengaja tidak dihapus agar dipakai ulang saat analisis jawaban QnA
    retainedFile?: GeminiFileRef
}

function safeParseJson(text: string) {
    try {
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim()
        return JSON.parse(cleaned)
    } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new PipelineError("PARSE", "Gagal parsing JSON dari respons Gemini", { retryable: true })
        try {
            return JSON.parse(jsonMatch[0])
        } catch (error) {
            throw new PipelineError("PARSE", `Gagal parsing JSON dari respons Gemini: ${errorMessage(error)}`, { retryable: true })
        }
    }
}

function toFileRef(file: FileMetadataResponse): GeminiFileRef {
    return {
        name: file.name,
        uri: file.uri,
        mimeType: file.mimeType,
        expiresAt: file.expirationTime ? new Date(file.expirationTime) : undefined,
    }
}

export async function deleteGeminiFile(fileName: string): Promise<void> {
    await fileManager.deleteFile(fileName).catch(e =>
        console.error("Failed to cleanup Gemini file:", errorMessage(e))
    )
}

async function withRetry<T>(
    stage: PipelineStage,
    maxRetries: number,
    tracker: ProcessingTracker,
    counter: "upload_attempts" | "generate_attempts",
    fn: (attempt: number) => Promise<T>
): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        tracker.increment(counter)
        try {
            return await fn(attempt)
        } catch (error) {
            const pipelineError = toPipelineError(error, stage)
            if (tracker.signal.aborted || attempt > maxRetries || !isRetryableError(pipelineError)) throw pipelineError
            const delay = Math.max(backoffDelay(attempt), Math.min(retryAfterMs(pipelineError) ?? 0, MAX_SERVER_RETRY_DELAY_MS))
            tracker.recordBackoff(stage, attempt, delay, pipelineError)
            await sleep(delay, tracker.signal)
        }
    }
}

async function uploadToGemini(filePath: string, mimeType: string, displayName: string, tracker: ProcessingTracker): Promise<GeminiFileRef> {
    await tracker.setStage("UPLOADING")
    return withRetry("UPLOAD", PIPELINE_CONFIG.maxUploadRetries, tracker, "upload_attempts", attempt =>
        tracker.timed("UPLOAD", attempt, "gemini_upload_ms", () =>
            withTimeout(
                async () => toFileRef((await uploadFileManager.uploadFile(filePath, { mimeType, displayName })).file),
                PIPELINE_CONFIG.uploadTimeoutMs,
                "UPLOAD",
                tracker.signal,
                lateFile => deleteGeminiFile(lateFile.name)
            )
        )
    )
}

async function waitForFileActive(fileName: string, tracker: ProcessingTracker): Promise<void> {
    const { activeInitialIntervalMs, activeMaxIntervalMs, activeBackoffFactor, activeTimeoutMs, failFast } = PIPELINE_CONFIG
    await tracker.setStage("WAITING_ACTIVE")

    await tracker.timed("FILE_ACTIVE", 1, "file_active_ms", async () => {
        const getState = async () => {
            tracker.increment("active_poll_count")
            try {
                return (await fileManager.getFile(fileName)).state
            } catch (error) {
                // Mode optimized: error sementara saat polling tidak langsung menggagalkan proses
                if (failFast && isRetryableError(error) && !tracker.signal.aborted) return FileState.PROCESSING
                throw toPipelineError(error, "FILE_ACTIVE")
            }
        }

        // Budget dihitung dari total waktu tidur, sama seperti versi asli (30 x 2 detik = 60 detik)
        let interval = activeInitialIntervalMs
        let slept = 0
        let state = await getState()
        while (state === FileState.PROCESSING) {
            if (slept + interval > activeTimeoutMs) {
                throw new PipelineError("FILE_ACTIVE", `File processing timed out after ${Math.round(activeTimeoutMs / 1000)} seconds.`, { isTimeout: true })
            }
            await sleep(interval, tracker.signal)
            slept += interval
            state = await getState()
            interval = Math.min(Math.round(interval * activeBackoffFactor), activeMaxIntervalMs)
        }

        if (state === FileState.FAILED) {
            throw new PipelineError("FILE_ACTIVE", "File processing failed by Gemini Server.")
        }
    })
}

async function isFileStillActive(file: GeminiFileRef): Promise<boolean> {
    if (file.expiresAt && file.expiresAt.getTime() < Date.now() + 60_000) return false
    try {
        return (await fileManager.getFile(file.name)).state === FileState.ACTIVE
    } catch {
        return false
    }
}

async function maybeInjectFault(tracker: ProcessingTracker, attempt: number, signal: AbortSignal): Promise<void> {
    const { faultGenerateErrorRate, faultGenerateHangRate, faultHangMs } = PIPELINE_CONFIG
    if (faultGenerateErrorRate <= 0 && faultGenerateHangRate <= 0) return
    const roll = Math.random()
    if (roll < faultGenerateErrorRate) {
        tracker.recordFault("error", attempt)
        throw new PipelineError("GENERATE", "[FAULT INJECTION] Simulated 503 Service Unavailable", { retryable: true, status: 503 })
    }
    if (roll < faultGenerateErrorRate + faultGenerateHangRate) {
        tracker.recordFault("hang", attempt)
        await sleep(faultHangMs, signal)
    }
}

async function generateWithPolicy<T>(modelName: string, parts: Part[], tracker: ProcessingTracker, parse: (text: string) => T): Promise<T> {
    await tracker.setStage("GENERATING")
    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
    })

    return withRetry("GENERATE", PIPELINE_CONFIG.maxGenerateRetries, tracker, "generate_attempts", attempt =>
        tracker.timed("GENERATE", attempt, "generate_ms", () =>
            withTimeout(async signal => {
                await maybeInjectFault(tracker, attempt, signal)
                const result = await model.generateContent(parts, { signal })
                return parse(result.response.text())
            }, PIPELINE_CONFIG.generateTimeoutMs, "GENERATE", tracker.signal)
        )
    )
}

const VIDEO_PROMPT = `Analyze this presentation video and provide a detailed evaluation in JSON format with the following structure:
        {
            "expression": <number 0-100>,
            "intonation": <number 0-100>,
            "posture": <number 0-100>,
            "video_score": <number 0-100>,
            "overall_score": <number 0-100>,
            "grade": "S" | "A" | "B" | "C" | "D" | "E",
            "suggestion": "One concise paragraph of constructive feedback focusing on VISUAL aspects.",
            "question": "<ONE critical thinking question based on the video content>"
        }

        Criteria:
        - Expression: Facial expressions, eye contact, enthusiasm (0-100)
        - Intonation: Voice modulation, clarity, pacing (0-100)
        - Posture: Body language, confidence, gestures (0-100)
        - video_score: Average of expression, intonation, posture
        - overall_score: Same as video_score initially (will be adjusted after audio analysis)
        - Grade: S=90-100, A=80-89, B=70-79, C=60-69, D=50-59, E=0-49
        - question: Generate ONE thoughtful audience question about the presentation content
        Only return valid JSON, no additional text.`

function toVideoAnalysisResult(text: string): VideoAnalysisResult {
    const analysis = safeParseJson(text)

    const videoScore = (
        (parseFloat(analysis.expression) || 0) +
        (parseFloat(analysis.intonation) || 0) +
        (parseFloat(analysis.posture) || 0)
    ) / 3

    return {
        expression: parseFloat(analysis.expression) || 0,
        intonation: parseFloat(analysis.intonation) || 0,
        posture: parseFloat(analysis.posture) || 0,
        video_score: parseFloat(videoScore.toFixed(2)),
        overall_score: parseFloat(videoScore.toFixed(2)),
        grade: analysis.grade || "E",
        suggestion: analysis.suggestion || "No suggestions available",
        question: analysis.question || "What was the main topic of your presentation?"
    }
}

export const analyzeVideoWithGemini = async (videoPath: string, tracker: ProcessingTracker): Promise<VideoAnalysisOutcome> => {
    let uploaded: GeminiFileRef | null = null
    let keepFile = false
    try {
        if (!fs.existsSync(videoPath)) throw new PipelineError("VALIDATION", `Video file not found at: ${videoPath}`)
        const videoMimeType = getVideoMimeType(videoPath)
        const sizeBytes = fs.statSync(videoPath).size

        let videoPart: Part
        if (PIPELINE_CONFIG.inlineVideoMaxMb > 0 && sizeBytes <= PIPELINE_CONFIG.inlineVideoMaxMb * 1024 * 1024) {
            // File kecil dikirim langsung (inline) tanpa File API: melewati tahap upload & menunggu ACTIVE
            tracker.setFlag("used_inline")
            videoPart = { inlineData: { mimeType: videoMimeType, data: fs.readFileSync(videoPath).toString("base64") } }
        } else {
            uploaded = await uploadToGemini(videoPath, videoMimeType, "Presentation Video Analysis", tracker)
            await waitForFileActive(uploaded.name, tracker)
            videoPart = { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } }
        }

        const analysis = await generateWithPolicy(VIDEO_MODEL_NAME, [videoPart, { text: VIDEO_PROMPT }], tracker, toVideoAnalysisResult)

        keepFile = PIPELINE_CONFIG.reuseGeminiFileForQna && uploaded !== null
        return { analysis, isFallback: false, retainedFile: keepFile ? uploaded ?? undefined : undefined }
    } catch (error) {
        console.error("Gemini analysis error:", errorMessage(error))
        if (PIPELINE_CONFIG.failFast) throw error
        tracker.noteFailure(error)
        return { analysis: generateMockAnalysis(), isFallback: true }
    } finally {
        if (uploaded && !keepFile) {
            console.log(`[Gemini] Cleaning up video file...`)
            await deleteGeminiFile(uploaded.name)
        }
    }
}

export const analyzeAudioAnswerWithGemini = async (
    audioPath: string,
    questionText: string,
    tracker: ProcessingTracker,
    contextVideoPath?: string,
    reusableVideoFile?: GeminiFileRef
): Promise<AudioAnalysisResult> => {

    let audioUpload: GeminiFileRef | null = null
    let videoUpload: GeminiFileRef | null = null

    try {
        if (!fs.existsSync(audioPath)) throw new PipelineError("VALIDATION", "Audio file not found")

        const audioMimeType = getAudioMimeType(audioPath)
        audioUpload = await uploadToGemini(audioPath, audioMimeType, "User Answer Audio", tracker)
        await waitForFileActive(audioUpload.name, tracker)

        let contextVideo: GeminiFileRef | null = null
        if (reusableVideoFile && await isFileStillActive(reusableVideoFile)) {
            // Optimasi: pakai file video yang sudah ada di Gemini, tanpa upload ulang
            tracker.setFlag("reused_gemini_file")
            contextVideo = reusableVideoFile
        } else if (contextVideoPath && fs.existsSync(contextVideoPath)) {
            console.log(`[Upload] Uploading context video: ${path.basename(contextVideoPath)}`)
            videoUpload = await uploadToGemini(contextVideoPath, getVideoMimeType(contextVideoPath), "Context Video", tracker)
            await waitForFileActive(videoUpload.name, tracker)
            contextVideo = videoUpload
        }

        const prompt = `
        You are an expert presentation coach.
        ${contextVideo ? "CONTEXT: The user gave the presentation shown in the provided video." : ""}
        QUESTION: "${questionText}"

        Task: Analyze the user's AUDIO ANSWER (BASED ON ITS RELEVANCY, IF ITS NOT RELEVANT TO THE CONTEXT, GIVE 0%, IF ITS NOT CLEAR, GIVE <50%).

        Step 1: Internal Metric Extraction (Do not output these, use them for Step 2)
        - Estimate Pace (Too Slow / Ideal / Too Fast)
        - Estimate WPM (Words Per Minute)
        - Count Filler Words (um, uh, like)
        - Assess Clarity (Low / High)

        Step 2: Combinatoric Analysis & Advice Generation
        Write a single, comprehensive "suggestion" paragraph. You MUST apply these behavioral rules to form your advice:

        - IF (Fast Pace + Low Clarity) -> Diagnose as "Nervousness/Rushing". Advice: Breathe and articulate.
        - IF (Slow Pace + High Fillers) -> Diagnose as "Uncertainty". Advice: Structure thoughts before speaking.
        - IF (Fast Pace + High Clarity) -> Diagnose as "Passion". Advice: Great energy, but ensure the listener can keep up.
        - IF (Ideal Pace + Low Energy) -> Diagnose as "Disinterest". Advice: Use more vocal variety.
        - IF (Ideal Pace + High Clarity) -> Diagnose as "Confident". Advice: Maintain this level.

        CRITICAL: Inside the suggestion text, you MUST explicitly mention their Pace, approximate WPM, and Filler Word count to justify your advice. Any other related suggestions are also acceptable. TALK ABOUT ITS RELEVANCY TO THE CONTEXT VIDEO PROVIDED

        Step 3: Output JSON
        Return strictly:
        {
            "score": <number 0-100 based on relevance and delivery>,
            "suggestion": "<The comprehensive paragraph from Step 2>"
        }
        `

        const requestParts: Part[] = []

        if (contextVideo) {
            requestParts.push({
                fileData: {
                    mimeType: contextVideo.mimeType,
                    fileUri: contextVideo.uri
                }
            })
        }

        requestParts.push({
            fileData: {
                mimeType: audioUpload.mimeType,
                fileUri: audioUpload.uri
            }
        })

        requestParts.push({ text: prompt })

        return await generateWithPolicy(QNA_MODEL_NAME, requestParts, tracker, text => {
            const responseJson = safeParseJson(text)
            return {
                score: responseJson.score || 0,
                suggestion: responseJson.suggestion || "Analysis complete, but no suggestion generated."
            }
        })

    } catch (error) {
        console.error("Gemini Audio Error:", errorMessage(error))
        if (PIPELINE_CONFIG.failFast) throw error
        tracker.noteFailure(error)
        return generateMockAudioAnalysis()
    } finally {
        if (audioUpload?.name) {
            await deleteGeminiFile(audioUpload.name)
        }
        if (videoUpload?.name) {
            await deleteGeminiFile(videoUpload.name)
        }
    }
}

export function generateMockAnalysis(): VideoAnalysisResult {
    return {
        expression: 0,
        intonation: 0,
        posture: 0,
        video_score: 0,
        overall_score: 0,
        grade: "E",
        suggestion: "⚠️ Video analysis failed due to AI service error. This could be due to: invalid API key, quota exceeded, or network timeout. Please check your Gemini API configuration and try again.",
        question: "What was the main topic of your presentation?"
    }
}

function generateMockAudioAnalysis(): AudioAnalysisResult {
    return {
        score: 0,
        suggestion: "Audio analysis failed due to connection error. Please try again."
    }
}

export function getVideoMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: { [key: string]: string } = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.mpeg': 'video/mpeg',
        '.mpg': 'video/mpeg'
    }
    return mimeTypes[ext] || 'video/mp4'
}

function getAudioMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: { [key: string]: string } = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.aac': 'audio/aac',
    }
    return mimeTypes[ext] || 'audio/mpeg'
}
