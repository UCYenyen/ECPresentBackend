import { GoogleGenerativeAI } from "@google/generative-ai"
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server" 
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_QNA_MODEL } from "./env-util"
import { VideoAnalysisResult, AudioAnalysisResult } from "../models/feedback-model"
import path from "path"
import fs from "fs"

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "")
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY || "")

function safeParseJson(text: string) {
    try {
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim()
        return JSON.parse(cleaned)
    } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("Gagal parsing JSON dari respons Gemini")
        return JSON.parse(jsonMatch[0])
    }
}

async function waitForFileActive(fileManager: GoogleAIFileManager, fileName: string, maxRetries = 30): Promise<void> {
    let retries = 0
    let file = await fileManager.getFile(fileName)
    while (file.state === FileState.PROCESSING) {
        if (retries >= maxRetries) {
            throw new Error(`File processing timed out after ${maxRetries * 2} seconds.`)
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
        file = await fileManager.getFile(fileName)
        retries++
    }

    if (file.state === FileState.FAILED) {
        throw new Error("File processing failed by Gemini Server.")
    }
}

export const analyzeVideoWithGemini = async (videoPath: string): Promise<VideoAnalysisResult> => {
    let uploadResponse: Awaited<ReturnType<typeof fileManager.uploadFile>> | null = null
    try {
        if (!fs.existsSync(videoPath)) throw new Error(`Video file not found at: ${videoPath}`)
        const videoMimeType = getVideoMimeType(videoPath)
        
        uploadResponse = await fileManager.uploadFile(videoPath, {
            mimeType: videoMimeType,
            displayName: "Presentation Video Analysis",
        })

        await waitForFileActive(fileManager, uploadResponse.file.name)

        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL || "gemini-2.0-flash-exp",
            generationConfig: { responseMimeType: "application/json" }
        })

        const prompt = `Analyze this presentation video and provide a detailed evaluation in JSON format with the following structure:
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

        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResponse.file.mimeType,
                    fileUri: uploadResponse.file.uri
                }
            },
            { text: prompt }
        ])

        const text = result.response.text()
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
    } catch (error) {
        console.error("Gemini analysis error:", error)
        return generateMockAnalysis()
    } finally {
        if (uploadResponse?.file.name) {
            console.log(`[Gemini] Cleaning up video file...`)
            await fileManager.deleteFile(uploadResponse.file.name).catch(e => 
                console.error("Failed to cleanup Gemini file:", e)
            )
        }
    }
}

export const analyzeAudioAnswerWithGemini = async (
    audioPath: string, 
    questionText: string, 
    contextVideoPath?: string
): Promise<AudioAnalysisResult> => {
    
    let audioUpload: Awaited<ReturnType<typeof fileManager.uploadFile>> | null = null
    let videoUpload: Awaited<ReturnType<typeof fileManager.uploadFile>> | null = null

    try {
        if (!fs.existsSync(audioPath)) throw new Error("Audio file not found")

        const audioMimeType = getAudioMimeType(audioPath)
        audioUpload = await fileManager.uploadFile(audioPath, {
            mimeType: audioMimeType,
            displayName: "User Answer Audio",
        })
        await waitForFileActive(fileManager, audioUpload.file.name)

        if (contextVideoPath && fs.existsSync(contextVideoPath)) {
            console.log(`[Upload] Uploading context video: ${path.basename(contextVideoPath)}`)
            const mimeType = getVideoMimeType(contextVideoPath)
            videoUpload = await fileManager.uploadFile(contextVideoPath, {
                mimeType: mimeType,
                displayName: "Context Video"
            })
            await waitForFileActive(fileManager, videoUpload.file.name)
        }

        const model = genAI.getGenerativeModel({ 
            model: GEMINI_QNA_MODEL || "gemini-2.0-flash", 
            generationConfig: { responseMimeType: "application/json" }
        })

        const prompt = `
        You are an expert presentation coach.
        ${contextVideoPath ? "CONTEXT: The user gave the presentation shown in the provided video." : ""}
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
    
        const requestParts: Array<{text: string} | {fileData: {mimeType: string, fileUri: string}}> = []

        if (videoUpload) {
            requestParts.push({
                fileData: {
                    mimeType: videoUpload.file.mimeType,
                    fileUri: videoUpload.file.uri
                }
            })
        }
        
        requestParts.push({
            fileData: {
                mimeType: audioUpload.file.mimeType,
                fileUri: audioUpload.file.uri
            }
        })

        requestParts.push({ text: prompt })

        const result = await model.generateContent(requestParts)
        const responseJson = safeParseJson(result.response.text())

        return {
            score: responseJson.score || 0,
            suggestion: responseJson.suggestion || "Analysis complete, but no suggestion generated."
        }

    } catch (error) {
        console.error("Gemini Audio Error:", error)
        return generateMockAudioAnalysis()
    } finally {
        if (audioUpload?.file.name) {
            await fileManager.deleteFile(audioUpload.file.name).catch(() => {})
        }
        if (videoUpload?.file.name) {
            await fileManager.deleteFile(videoUpload.file.name).catch(() => {})
        }
    }
}

function generateMockAnalysis(): VideoAnalysisResult {
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

function getVideoMimeType(filePath: string): string {
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