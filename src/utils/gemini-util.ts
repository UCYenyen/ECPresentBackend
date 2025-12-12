import { GoogleGenerativeAI } from "@google/generative-ai"
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server" 
import { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_QNA_MODEL } from "./env-util"

export interface GeminiAnalysisResult {
    expression: number
    intonation: number
    posture: number
    overall_rating: string
    suggestion: string
    questions: string[]
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "")
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY || "") 

export const analyzeVideoWithGemini = async (videoPath: string): Promise<GeminiAnalysisResult> => {
    try {
        // 1. UPLOAD FILE KE GOOGLE (Pengganti Base64)
        // Ini mencegah server crash karena RAM penuh saat load video
        const uploadResponse = await fileManager.uploadFile(videoPath, {
            mimeType: "video/mp4",
            displayName: "Presentation Video Analysis",
        });

        // 2. TUNGGU PROSES (POLLING)
        // Video harus status 'ACTIVE' sebelum bisa dianalisis
        let file = await fileManager.getFile(uploadResponse.file.name);
        while (file.state === FileState.PROCESSING) {
            // Tunggu 2 detik lalu cek lagi
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResponse.file.name);
        }

        if (file.state === FileState.FAILED) {
            throw new Error("Video processing failed by Gemini.");
        }

        // 3. KONFIGURASI MODEL
        // Menambahkan 'responseMimeType: application/json' agar output PASTI JSON valid
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL || "gemini-2.0-flash-exp",
            generationConfig: { responseMimeType: "application/json" }
        })

        // 4. PROMPT (TIDAK BERUBAH SAMA SEKALI)
        const prompt = `Analyze this presentation video, make sure that the video is indeed a valid presentation video not just a random mubling video and provide a detailed evaluation using the language that the presenter is speaking about the presentation in JSON format with the following structure:
        {
            "expression": <float 0-100>,
            "intonation": <float 0-100>,
            "posture": <float 0-100>,
            "overall_rating": <string: "S", "A", "B", "C", "D", or "E">,
            "suggestion": <string with improvement suggestions>,
            "questions": [<array of 3 potential audience questions based on the video that the audience gave>]
        }
        
        Criteria:
        - Expression: Facial expressions, eye contact, enthusiasm
        - Intonation: Voice modulation, clarity, pacing
        - Posture: Body language, confidence, gestures
        - Overall Rating: S=Excellent, A=Very Good, B=Good, C=Average, D=Below Average, E=Poor
        
        Only return valid JSON, no additional text.`

        // 5. GENERATE CONTENT
        // Menggunakan fileUri, bukan inlineData (Base64)
        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResponse.file.mimeType,
                    fileUri: uploadResponse.file.uri
                }
            },
            { text: prompt }
        ])

        // 6. CLEANUP (Hapus file dari server Google setelah selesai)
        await fileManager.deleteFile(uploadResponse.file.name);

        const response = result.response
        const text = response.text()
        
        // Parse JSON response
        // Karena sudah pakai responseMimeType: application/json, parsing lebih aman
        // Tapi tetap pakai logic parsing kamu untuk jaga-jaga
        let analysis;
        try {
            analysis = JSON.parse(text);
        } catch (e) {
             const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                throw new Error("Failed to parse Gemini response")
            }
            analysis = JSON.parse(jsonMatch[0])
        }

        return {
            expression: parseFloat(analysis.expression) || 0,
            intonation: parseFloat(analysis.intonation) || 0,
            posture: parseFloat(analysis.posture) || 0,
            overall_rating: analysis.overall_rating || "C",
            suggestion: analysis.suggestion || "No suggestions available",
            questions: analysis.questions || []
        }
    } catch (error) {
        console.error("Gemini analysis error:", error)
        // Fallback to mock data if Gemini fails
        return generateMockAnalysis()
    }
}

function generateMockAnalysis(): GeminiAnalysisResult {
    const mockRatings = ["S", "A", "B", "C", "D", "E"]
    return {
        expression: 0,
        intonation: 0,
        posture: 0,
        overall_rating: "E",
        suggestion: "-",
        questions: [
            "-",
            "-",
            "-"
        ]
    }
}


export interface AudioAnalysisResult {
    score: number
    feedback: string
    is_relevant: boolean
}

export const analyzeAudioAnswerWithGemini = async (audioPath: string, questionText: string): Promise<AudioAnalysisResult> => {
    try {
        const uploadResponse = await fileManager.uploadFile(audioPath, {
            mimeType: "audio/mp3", 
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
        Context: The user is practicing a presentation interview.
        The question asked was: "${questionText}"
        
        Task: Listen to the user's audio answer and evaluate it.
        1. Relevance: Did they actually answer the question?
        2. Clarity & Confidence: How did they sound?
        
        Return JSON format:
        {
            "score": <integer 0-100>,
            "feedback": <string, max 2 sentences constructive feedback>,
            "is_relevant": <boolean>
        }`

        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResponse.file.mimeType,
                    fileUri: uploadResponse.file.uri
                }
            },
            { text: prompt }
        ])

        await fileManager.deleteFile(uploadResponse.file.name);

        const responseJson = JSON.parse(result.response.text());

        return {
            score: responseJson.score || 0,
            feedback: responseJson.feedback || "Tidak ada feedback.",
            is_relevant: responseJson.is_relevant ?? true
        }

    } catch (error) {
        console.error("Gemini Audio Error:", error);
        return generateMockAudioAnalysis(); 
    }
}

function generateMockAudioAnalysis(): AudioAnalysisResult {
    return {
        score: 0,
        feedback: "Maaf, sistem gagal menganalisis audio Anda karena gangguan koneksi. Silakan coba lagi.",
        is_relevant: false
    }
}
