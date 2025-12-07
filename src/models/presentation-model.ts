import { string } from "zod"

export interface PresentationData {
    id: number
    userId: number
    createdAt: Date
    updatedAt: Date
    video_url: string
}
export interface PresentationResponse {
    id: number
    userId: number
}
export interface GetAllUserPresentations{
    userId: number
}
export interface CreatePresentationRequest {
    userId: number
}

export function toPresentationResponse(
    {id, userId}: PresentationData
) {
    return {
        id,
        userId
    }
}


export function toPresentationsResponse(
    presentations: PresentationData[]
):  PresentationData[] {    
    return presentations.map((presentation) => toPresentationResponse(presentation));
}   
