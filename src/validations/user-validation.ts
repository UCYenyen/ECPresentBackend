import { z, ZodType } from "zod"

export class UserValidation {
    static readonly REGISTER: ZodType = z.object({
        username: z
            .string({
                error: "Username must be string!",
            })
            .min(1, {
                error: "Username can not be empty!",
            }),
        email: z
            .email({
                error: "Email format is invalid!",
            })
            .min(1, {
                error: "Email can not be empty!",
            }),
        password: z
            .string({
                error: "Password must be string!",
            })
            .min(8, {
                error: "Password must contain more than or equal to 8 characters!",
            }),
    })

    static readonly LOGIN: ZodType = z.object({
        email: z
            .email({
                error: "Email format is invalid!",
            })
            .min(1, {
                error: "Email can not be empty!",
            }),
        password: z
            .string({
                error: "Password must be string!",
            })
            .min(8, {
                error: "Password must contain more than or equal to 8 characters!",
            }),
    })

    static readonly UPDATE: ZodType = z.object({
        username: z
            .string({
                error: "Username must be string!",
            })
            .min(1, {
                error: "Username can not be empty!",
            }).optional(),
        email: z   
            .email({
                error: "Email format is invalid!",
            })
            .min(1, {
                error: "Email can not be empty!",
            }) 
            .optional(),
        password: z
            .string({
                error: "Password must be string!",
            })
            .min(8, {
                error: "Password must contain more than or equal to 8 characters!",
            })
            .optional(),
    })
}
