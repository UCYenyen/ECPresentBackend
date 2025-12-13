import express from "express"
import { authMiddleware } from "../middlewares/auth-middleware"
import { UserController } from "../controllers/user-controller"
import { PresentationController } from "../controllers/presentation-controller"
import { uploadVideo, uploadAudio } from "../middlewares/upload-middleware"
import { uploadImage } from "../middlewares/upload-image.middleware"
import { LearningController } from "../controllers/learning-controller"
import { AvatarController } from "../controllers/avatar-controller"

export const privateRouter = express.Router()
privateRouter.use(authMiddleware)

privateRouter.post("/register-from-guest", UserController.registerFromGuest)
privateRouter.get("/get-profile", UserController.getProfile)
privateRouter.put("/update-profile", UserController.updateProfile)

privateRouter.post("/presentations", uploadVideo.single('video'), PresentationController.create)
privateRouter.get("/presentations", PresentationController.list)
privateRouter.get("/presentations/:id", PresentationController.getById)
privateRouter.get("/presentations/:presentationId/analysis", PresentationController.getAnalysis)
privateRouter.get("/presentations/:presentationId/feedback", PresentationController.getFinalFeedback)
privateRouter.post("/presentations/:presentationId/answer", uploadAudio.single('audio'), PresentationController.submitAnswer)
privateRouter.delete("/presentations/:id", PresentationController.delete)

privateRouter.get("/get-my-learnings", LearningController.getAllLearningProgresses)
privateRouter.get("/get-learning/:id", LearningController.getLearningProgress)
privateRouter.post("/start-learning", LearningController.startLearning)


privateRouter.post("/avatar", uploadImage.single('image'), AvatarController.create)
privateRouter.get("/avatar", AvatarController.list)
privateRouter.get("/avatar/:id", AvatarController.get)
privateRouter.put("/avatar/:id", uploadImage.single('image'), AvatarController.update)
privateRouter.delete("/avatar/:id", AvatarController.delete)