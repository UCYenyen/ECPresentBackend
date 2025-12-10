import dotenv from "dotenv"

dotenv.config()

export const PORT = process.env.PORT
export const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY
export const GEMINI_MODEL = process.env.GEMINI_MODEL