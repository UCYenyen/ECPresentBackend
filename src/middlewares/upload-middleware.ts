import multer from 'multer'
import path from 'path'

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/')
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
})

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Tambahkan MIME types untuk .mov files
    const allowedTypes = [
        'video/mp4', 
        'video/mpeg', 
        'video/quicktime',  // .mov files
        'video/x-msvideo',  // .avi files
        'video/webm',
        'video/x-quicktime' // alternative MIME type untuk .mov
    ]
    
    // Juga check berdasarkan extension sebagai fallback
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
        fileSize: 100 * 1024 * 1024 // 100MB
    }
})