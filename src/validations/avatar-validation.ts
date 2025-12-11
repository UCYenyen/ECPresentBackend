import { z, ZodType } from "zod";

export class AvatarValidation {
    static readonly UPDATE: ZodType = z.object({
        id: z.number().positive()
    });
}