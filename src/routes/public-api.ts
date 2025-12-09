import express from "express"
import { UserController } from "../controllers/user-controller"

export const publicRouter = express.Router()

publicRouter.post("/register", UserController.register)
publicRouter.post("/login", UserController.login)
publicRouter.post("/guest", UserController.guest)

