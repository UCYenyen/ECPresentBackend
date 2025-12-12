import dotenv from "dotenv"

dotenv.config()

export const PORT = process.env.PORT
export const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY
export const GEMINI_MODEL = process.env.GEMINI_MODEL
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET
export const GEMINI_QNA_MODEL = process.env.GEMINI_QNA_MODEL
