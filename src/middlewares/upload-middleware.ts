import multer from 'multer'
import path from 'path'
import fs from 'fs'


const uploadDir = 'uploads/'
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
})

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {

    const allowedTypes = [
        'video/mp4', 
        'video/mpeg', 
        'video/quicktime',  
        'video/x-msvideo',  
        'video/webm',
        'video/x-quicktime' 
    ]

    const allowedExtensions = ['.mp4', '.mpeg', '.mov', '.avi', '.webm']
    const fileExtension = path.extname(file.originalname).toLowerCase()
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
        cb(null, true)
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only video files are allowed.`))
    }
}

export const uploadVideo = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 
    }
})


export const uploadAudio = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.mp3', '.wav', '.ogg', '.aac']
        const fileExtension = path.extname(file.originalname).toLowerCase()

        if (file.mimetype.startsWith('audio/') || allowedExtensions.includes(fileExtension)) {
            cb(null, true)
        } else {
            cb(new Error('Invalid file type. Only audio files are allowed.'))
        }
    }
})