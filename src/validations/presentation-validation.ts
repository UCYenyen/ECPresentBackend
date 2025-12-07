import { z, ZodType } from "zod"

export class PresentationValidation {
    static readonly CREATE: ZodType = z.object({
        title: z
            .string({
                error: "Username must be string!",
            })
            .min(1, {
                error: "Username can not be empty!",
            }),
        userId: z
            .number({
                error: "UserId must be filled!",
            })
            .min(1, {
                error: "UserId can not be empty!",
            }),
    })

    static readonly GET: ZodType = z.object({
        id: z
            .number({
                error: "Id must be filled!",
            })
    })
}
