import express from "express"
import { UserController } from "../controllers/user-controller"
import { LearningController } from "../controllers/learning-controller"

export const publicRouter = express.Router()

publicRouter.post("/register", UserController.register)
publicRouter.post("/login", UserController.login)
publicRouter.post("/guest", UserController.guest)
publicRouter.get("/getAllLearnings", LearningController.getAllLearnings)
publicRouter.get("/getLearning/:id", LearningController.getLearningById)

