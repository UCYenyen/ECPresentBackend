import express from "express"
import { authMiddleware } from "../middlewares/auth-middleware"

export const privateRouter = express.Router()

privateRouter.use(authMiddleware)
