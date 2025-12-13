import { z, ZodType } from "zod"

export class PresentationValidation {
    static readonly CREATE: ZodType = z.object({
        title: z.string().min(1),
        user_id: z.number().min(1),
        video_url: z.string().min(1, "Video path is required")
    })

    static readonly GET: ZodType = z.object({
        id: z.number().min(1),
        user_id: z.number().min(1).optional()
    })

    static readonly UPDATE: ZodType = z.object({
        id: z.number().min(1),
        title: z.string().min(1).optional(),
        video_url: z.string().min(1).optional(),
        status: z.enum(["ONGOING", "COMPLETED", "FAILED"]).optional()
    })

    static readonly SUBMIT_ANSWER: ZodType = z.object({
        presentationId: z.number().positive(),
        audioPath: z.string().min(1),
        questionText: z.string().min(1)
    })
}