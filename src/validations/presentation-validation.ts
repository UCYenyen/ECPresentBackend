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
        audioPath: z.string().min(1)
    })

    static readonly GET_AVERAGE: ZodType = z.object({
        userId: z.number().min(1)
    })

    static readonly CLIENT_METRICS: ZodType = z.object({
        client_platform: z.string().max(50).optional(),
        client_prepare_ms: z.number().int().nonnegative().optional(),
        client_request_ms: z.number().int().nonnegative().optional(),
        client_wait_ms: z.number().int().nonnegative().optional(),
        client_total_ms: z.number().int().nonnegative().optional(),
        client_poll_count: z.number().int().nonnegative().optional(),
        client_outcome: z.string().max(50).optional()
    })
}