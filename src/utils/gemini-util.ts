import { GoogleGenerativeAI } from "@google/generative-ai"
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server" 
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_QNA_MODEL } from "./env-util"
import { VideoAnalysisResult, AudioAnalysisResult } from "../models/feedback-model"
import path from "path"

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "")
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY || "") 

// Helper: Deteksi MIME type dari file extension
function getVideoMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.mpeg': 'video/mpeg',
        '.mpg': 'video/mpeg'
    };
    return mimeTypes[ext] || 'video/mp4';
}

function getAudioMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.webm': 'audio/webm',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac'
    };
    return mimeTypes[ext] || 'audio/wav';
} 

function safeParseJson(text: string) {
    try {
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (e) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Gagal parsing JSON dari respons Gemini");
        return JSON.parse(jsonMatch[0]);
    }
}

export const analyzeVideoWithGemini = async (videoPath: string): Promise<VideoAnalysisResult> => {
    let uploadResponse: Awaited<ReturnType<typeof fileManager.uploadFile>> | null = null;
    try {
        // Deteksi MIME type dari file extension
        const videoMimeType = getVideoMimeType(videoPath);
        
        uploadResponse = await fileManager.uploadFile(videoPath, {
            mimeType: videoMimeType,
            displayName: "Presentation Video Analysis",
        });

        let file = await fileManager.getFile(uploadResponse.file.name);
        while (file.state === FileState.PROCESSING) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResponse.file.name);
        }

        if (file.state === FileState.FAILED) {
            throw new Error("Video processing failed by Gemini.");
        }

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
            "questions": [<array of 3 potential audience questions (critical thinking questions) based on the video content>]
        }
        
        Criteria:
        - Expression: Facial expressions, eye contact, enthusiasm (0-100)
        - Intonation: Voice modulation, clarity, pacing (0-100)
        - Posture: Body language, confidence, gestures (0-100)
        - video_score: Average of expression, intonation, posture
        - overall_score: Same as video_score initially (will be adjusted after audio analysis)
        - Grade: S=90-100, A=80-89, B=70-79, C=60-69, D=50-59, E=0-49
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
        const analysis = safeParseJson(text);

        const videoScore = (
            (parseFloat(analysis.expression) || 0) +
            (parseFloat(analysis.intonation) || 0) +
            (parseFloat(analysis.posture) || 0)
        ) / 3;

        return {
            expression: parseFloat(analysis.expression) || 0,
            intonation: parseFloat(analysis.intonation) || 0,
            posture: parseFloat(analysis.posture) || 0,
            video_score: parseFloat(videoScore.toFixed(2)),
            overall_score: parseFloat(videoScore.toFixed(2)),
            grade: analysis.grade || "E", 
            suggestion: analysis.suggestion || "No suggestions available",
            questions: analysis.questions || []
        }
    } catch (error) {
        console.error("Gemini analysis error:", error)
        return generateMockAnalysis()
    } finally {
        if (uploadResponse?.file.name) {
            await fileManager.deleteFile(uploadResponse.file.name).catch(e => 
                console.error("Failed to cleanup Gemini file:", e)
            );
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
        questions: [
            "What was the main topic of your presentation?",
            "Can you elaborate on your key points?",
            "What would you improve for next time?"
        ]
    }
}

export const analyzeAudioAnswerWithGemini = async (
    audioPath: string, 
    questionText: string, 
    mimeType?: string
): Promise<AudioAnalysisResult> => {
    let uploadResponse: Awaited<ReturnType<typeof fileManager.uploadFile>> | null = null;
    try {
        // Gunakan mimeType yang diberikan, atau deteksi dari file
        const audioMimeType = mimeType || getAudioMimeType(audioPath);
        
        uploadResponse = await fileManager.uploadFile(audioPath, {
            mimeType: audioMimeType,
            displayName: "User Answer Audio",
        });

        let file = await fileManager.getFile(uploadResponse.file.name);
        while (file.state === FileState.PROCESSING) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            file = await fileManager.getFile(uploadResponse.file.name);
        }

        if (file.state === FileState.FAILED) throw new Error("Audio processing failed.");
        
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_QNA_MODEL || "gemini-1.5-flash", 
            generationConfig: { responseMimeType: "application/json" }
        })

        const prompt = `
        Context: User is answering an interview question: "${questionText}".
        Task: Analyze the audio answer for content quality and delivery efficiency.
        
        Evaluate based on:
        1. Relevance: Does the answer address the question?
        2. Clarity: Pronunciation and audio quality
        3. Pace: Speaking speed (too slow, ideal, or too fast)
        4. Filler Words: Count usage of 'umm', 'uhh', 'like', 'ehm', 'anu'
        
        Output JSON Requirement:
        {
            "score": <number 0-100>,
            "analysis": {
                "delivery": {
                    "pace": "too_slow" | "ideal" | "too_fast",
                    "wpm": <estimated number of words per minute>,
                    "clarity": <number 0-100>
                },
                "fillerWords": {
                    "totalCount": <number>,
                    "distinctWords": ["umm", "like", "you know"]
                },
                "suggestion": "Short advice (max 2 sentences) to improve THIS specific answer."
            }
        }
        
        Scoring Guide:
        - 90-100: Excellent answer, clear, concise, no filler words
        - 70-89: Good answer with minor improvements needed
        - 50-69: Average answer, needs significant improvement
        - 0-49: Poor answer or irrelevant
        `
        
        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResponse.file.mimeType,
                    fileUri: uploadResponse.file.uri
                }
            },
            { text: prompt }
        ])

        const responseJson = safeParseJson(result.response.text());

        return {
            score: responseJson.score || 0,
            analysis: {
                delivery: responseJson.analysis?.delivery || { 
                    pace: "ideal", 
                    wpm: 0, 
                    clarity: 0 
                },
                fillerWords: responseJson.analysis?.fillerWords || { 
                    totalCount: 0, 
                    distinctWords: [] 
                },
                suggestion: responseJson.analysis?.suggestion || "No feedback available."
            }
        }

    } catch (error) {
        console.error("Gemini Audio Error:", error);
        return generateMockAudioAnalysis(); 
    } finally {
        if (uploadResponse?.file.name) {
            await fileManager.deleteFile(uploadResponse.file.name).catch(e => 
                console.error("Failed to cleanup Gemini file:", e)
            );
        }
    }
}

function generateMockAudioAnalysis(): AudioAnalysisResult {
    return {
        score: 0,
        analysis: {
            delivery: { pace: "ideal", wpm: 0, clarity: 0 },
            fillerWords: { totalCount: 0, distinctWords: [] },
            suggestion: "Audio analysis failed due to connection error. Please try again."
        }
    }
}