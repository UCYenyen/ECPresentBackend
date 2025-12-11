import { v2 as cloudinary } from 'cloudinary'
import { CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME } from './env-util'
import fs from 'fs'

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
})

export class CloudinaryUtil {
    static async uploadFile(filePath: string, folder: string = "avatars"): Promise<string> {
        try {
            const result = await cloudinary.uploader.upload(filePath, {
                folder: folder,
                resource_type: 'image'
            })
            
            // Hapus file lokal setelah upload berhasil
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
            
            return result.secure_url
        } catch (error) {
            // Hapus file lokal jika upload gagal
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
            throw error
        }
    }
}