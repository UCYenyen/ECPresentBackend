import { z, ZodType } from "zod"

export class LearningValidation {
    static readonly GET_ALL: ZodType = z.object({
        id: z.number({error: "Invalid learning ID: the learning you're looking for doesn't exist"}).min(1)
    })

    static readonly START_LEARNING_PROGRESS: ZodType = z.object({
        user_id: z.number({error: "Invalid user ID: the user you're looking for doesn't exist"}).min(1),
        learning_id: z.number({error: "Invalid learning ID : the learning you're looking for doesn't exist"}).min(1)
    })


}