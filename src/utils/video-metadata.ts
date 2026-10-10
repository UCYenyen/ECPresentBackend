import fs from "fs"

// Membaca durasi video MP4/MOV dari box `moov/mvhd` tanpa dependensi eksternal (ffprobe).
// Mengembalikan undefined untuk format lain atau file yang tidak bisa dibaca.
export function readVideoDurationSec(filePath: string): number | undefined {
    let fd: number | undefined
    try {
        fd = fs.openSync(filePath, "r")
        const fileSize = fs.fstatSync(fd).size
        const moov = findBox(fd, 0, fileSize, "moov")
        if (!moov) return undefined
        const mvhd = findBox(fd, moov.dataStart, moov.end, "mvhd")
        if (!mvhd) return undefined

        const header = Buffer.alloc(32)
        fs.readSync(fd, header, 0, header.length, mvhd.dataStart)
        const version = header.readUInt8(0)
        const timescale = version === 1 ? header.readUInt32BE(20) : header.readUInt32BE(12)
        const duration = version === 1 ? Number(header.readBigUInt64BE(24)) : header.readUInt32BE(16)
        if (!timescale) return undefined
        return Math.round((duration / timescale) * 100) / 100
    } catch {
        return undefined
    } finally {
        if (fd !== undefined) fs.closeSync(fd)
    }
}

function findBox(fd: number, start: number, end: number, type: string): { dataStart: number; end: number } | undefined {
    const header = Buffer.alloc(16)
    let offset = start
    while (offset + 8 <= end) {
        fs.readSync(fd, header, 0, 16, offset)
        let size = header.readUInt32BE(0)
        const boxType = header.toString("latin1", 4, 8)
        let headerSize = 8
        if (size === 1) {
            size = Number(header.readBigUInt64BE(8))
            headerSize = 16
        } else if (size === 0) {
            size = end - offset
        }
        if (size < headerSize) return undefined
        if (boxType === type) return { dataStart: offset + headerSize, end: offset + size }
        offset += size
    }
    return undefined
}
