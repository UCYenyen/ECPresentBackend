import { NextFunction, Response } from "express"
import { UserRequest } from "../models/user-model"
import { ResponseError } from "../error/response-error"
import { verifyToken, generateToken } from "../utils/jwt-util"

export const authMiddleware = (
    req: UserRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers["authorization"]
        const token = authHeader && authHeader.split(" ")[1]

        if (!token) {
            return next(new ResponseError(401, "Unauthorized user!"))
        }

        const payload = verifyToken(token!)

        if (!payload) {
            return next(new ResponseError(401, "Unauthorized user!"))
        }

        req.user = payload

        // Auto-refresh token untuk guest user
        if (payload.isGuest) {
            const decodedToken = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
            const expiryTime = decodedToken.exp * 1000
            const currentTime = Date.now()
            const timeUntilExpiry = expiryTime - currentTime
            const oneDayInMs = 24 * 60 * 60 * 1000

            // Jika token akan expired dalam 1 hari, generate token baru
            if (timeUntilExpiry < oneDayInMs) {
                const newToken = generateToken(
                    {
                        id: payload.id,
                        username: payload.username,
                        email: payload.email,
                        isGuest: payload.isGuest
                    },
                    "7d" // 7 hari untuk guest
                )
                
                // Kirim token baru via response header
                res.setHeader('X-New-Token', newToken)
                console.log(`Guest token refreshed for user ${payload.id}`)
            }
        }

        next()
    } catch (error) {
        next(error)
    }
}