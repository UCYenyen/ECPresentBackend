import express from "express"
import { authMiddleware } from "../middlewares/auth-middleware"
import { UserController } from "../controllers/user-controller"
import { PresentationController } from "../controllers/presentation-controller"
import { uploadVideo } from "../middlewares/upload-middleware"

export const privateRouter = express.Router()

privateRouter.use(authMiddleware)
privateRouter.post("/register-from-guest", UserController.registerFromGuest)
privateRouter.post("/presentations", uploadVideo.single('video'), PresentationController.create)
privateRouter.get("/presentations/:presentationId/analysis", PresentationController.getAnalysis)