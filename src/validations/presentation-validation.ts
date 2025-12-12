import { z, ZodType } from "zod"

export class PresentationValidation {
    static readonly CREATE: ZodType = z.object({
        title: z.string().min(1),
        user_id: z.number().min(1),
        video_url: z.string(). min(1, "Video path is required")
    })

    static readonly GET: ZodType = z.object({
        id: z.number().min(1)
    })
}