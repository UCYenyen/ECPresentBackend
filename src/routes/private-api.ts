import express from "express"
import { authMiddleware } from "../middlewares/auth-middleware"
import { UserController } from "../controllers/user-controller"
import { PresentationController } from "../controllers/presentation-controller"
import { uploadVideo, uploadAudio } from "../middlewares/upload-middleware"
import { publicRouter } from "./public-api"
import { LearningController } from "../controllers/learning-controller"

export const privateRouter = express.Router()

privateRouter.use(authMiddleware)
privateRouter.post("/register-from-guest", UserController.registerFromGuest)

privateRouter.post("/presentations", uploadVideo.single('video'), PresentationController.create)
privateRouter.get("/presentations/:presentationId/analysis", PresentationController.getAnalysis)

privateRouter.post("/questions/:questionId/answer",uploadAudio.single('audio'), PresentationController.submitAnswer)

publicRouter.get("/get-my-learnings", LearningController.getAllLearningProgresses)
publicRouter.get("/get-learning/:id", LearningController.getLearningProgress)
publicRouter.post("/start-learning", LearningController.startLearning)