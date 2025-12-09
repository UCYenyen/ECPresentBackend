import express from "express"
import { authMiddleware } from "../middlewares/auth-middleware"
import { UserController } from "../controllers/user-controller"

export const privateRouter = express.Router()

privateRouter.use(authMiddleware)
privateRouter.post("/register-from-guest", UserController.registerFromGuest)
