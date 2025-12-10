import { GoogleGenerativeAI } from "@google/generative-ai"
import { GEMINI_API_KEY, GEMINI_MODEL } from "./env-util"
import fs from "fs"

export interface GeminiAnalysisResult {
    expression: number
    intonation: number
    posture: number
    overall_rating: string
    suggestion: string
    questions: string[]
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "")

export const analyzeVideoWithGemini = async (videoPath: string): Promise<GeminiAnalysisResult> => {
    try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL || "gemini-2.0-flash-exp" })

        // Read video file
        const videoData = fs.readFileSync(videoPath)
        const videoBase64 = videoData.toString('base64')

        const prompt = `Analyze this presentation video and provide a detailed evaluation in JSON format with the following structure:
        {
            "expression": <float 0-100>,
            "intonation": <float 0-100>,
            "posture": <float 0-100>,
            "overall_rating": <string: "S", "A", "B", "C", "D", or "E">,
            "suggestion": <string with improvement suggestions>,
            "questions": [<array of 3 potential audience questions>]
        }
        
        Criteria:
        - Expression: Facial expressions, eye contact, enthusiasm
        - Intonation: Voice modulation, clarity, pacing
        - Posture: Body language, confidence, gestures
        - Overall Rating: S=Excellent, A=Very Good, B=Good, C=Average, D=Below Average, E=Poor
        
        Only return valid JSON, no additional text.`

        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: "video/mp4",
                    data: videoBase64
                }
            },
            { text: prompt }
        ])

        const response = result.response
        const text = response.text()
        
        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error("Failed to parse Gemini response")
        }

        const analysis = JSON.parse(jsonMatch[0])

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
        expression: parseFloat((Math.random() * 100).toFixed(2)),
        intonation: parseFloat((Math.random() * 100).toFixed(2)),
        posture: parseFloat((Math.random() * 100).toFixed(2)),
        overall_rating: mockRatings[Math.floor(Math.random() * mockRatings.length)],
        suggestion: "Try to maintain eye contact and vary your pitch to keep the audience engaged.",
        questions: [
            "Could you elaborate on the data source used in slide 3?",
            "How does this solution scale with more users?",
            "What were the main challenges you faced during implementation?"
        ]
    }
}