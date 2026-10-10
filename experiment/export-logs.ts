import "dotenv/config"
import fs from "fs"
import path from "path"
import { ProcessingLog } from "@prisma/client"
import { prismaClient } from "../src/utils/database-util"

// Export tabel processing_logs ke CSV + ringkasan statistik per (label, mode, bucket durasi),
// plus template_<kind>_*.csv yang urutan kolomnya sama dengan Template_Pencatatan_Pengujian.xlsx.
//
// Pemakaian:
//   npm run experiment:export
//   npm run experiment:export -- --kind ANSWER --label baseline --stuck-min 5 --buckets 1,3,5,8
//   npm run experiment:export -- --decimal-comma   (untuk Excel berformat Indonesia: pemisah ";" dan desimal ",")

function arg(name: string, fallback?: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

const kind = (arg("kind", "VIDEO") as string).toUpperCase()
const label = arg("label")
const stuckMs = Number(arg("stuck-min", "5")) * 60_000
const buckets = (arg("buckets", "1,3,5,8") as string).split(",").map(Number)
const outDir = path.resolve(arg("out", path.join(__dirname, "results")) as string)
const decimalComma = process.argv.includes("--decimal-comma")

type Outcome = "SUCCESS" | "SILENT_FAILURE" | "FAILED" | "TIMEOUT" | "STUCK" | "RUNNING"

function classify(log: ProcessingLog): Outcome {
    switch (log.status) {
        case "SUCCESS": return "SUCCESS"
        case "FALLBACK": return "SILENT_FAILURE" // user menerima feedback mock skor 0 tanpa tahu ada error
        case "TIMEOUT": return "TIMEOUT"
        case "FAILED": return "FAILED"
        default: return Date.now() - log.updatedAt.getTime() > stuckMs ? "STUCK" : "RUNNING"
    }
}

function bucketOf(durationSec: number | null): string {
    if (!durationSec) return "unknown"
    const minutes = durationSec / 60
    return String(buckets.reduce((best, b) => (Math.abs(b - minutes) < Math.abs(best - minutes) ? b : best)))
}

const sec = (ms: number | null | undefined) => (ms === null || ms === undefined ? "" : (ms / 1000).toFixed(2))

function stats(values: number[]) {
    if (values.length === 0) return { mean: NaN, median: NaN, sd: NaN, p95: NaN, min: NaN, max: NaN }
    const sorted = [...values].sort((a, b) => a - b)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const sd = values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)) : 0
    const quantile = (q: number) => {
        const pos = (sorted.length - 1) * q
        const lo = Math.floor(pos)
        return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo)
    }
    return { mean, median: quantile(0.5), sd, p95: quantile(0.95), min: sorted[0], max: sorted[sorted.length - 1] }
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN)
const fmt = (ms: number) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) : "")

function toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return ""
    const headers = Object.keys(rows[0])
    const delimiter = decimalComma ? ";" : ","
    const escape = (value: unknown) => {
        let text = value === null || value === undefined ? "" : String(value)
        if (decimalComma && /^-?\d+\.\d+$/.test(text)) text = text.replace(".", ",")
        return text.includes(delimiter) || /["\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    return [headers.map(escape).join(delimiter), ...rows.map(row => headers.map(h => escape(row[h])).join(delimiter))].join("\n") + "\n"
}

const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const sampleCode = (label: string | null) => (label ?? "").replace(/\.[^.]+$/, "")

// Baris siap tempel ke sheet "Data Pengujian" (kolom A–S) atau "Data QnA" (kolom A–N)
function toTemplateRow(log: ProcessingLog, no: number): Record<string, unknown> {
    const bucket = bucketOf(log.video_duration_sec)
    const common = {
        "No": no,
        "Tanggal": localDate(log.request_received_at ?? log.createdAt),
        "Label Fase": log.experiment_label,
        "Mode": log.pipeline_mode,
        "Kode Sampel": sampleCode(log.sample_label),
    }
    if (kind === "ANSWER") {
        return {
            ...common,
            "Durasi Video Target (mnt)": bucket === "unknown" ? "" : bucket,
            "Pakai Ulang File Video?": log.reused_gemini_file ? "Ya" : "Tidak",
            "Upload ke Gemini (dtk)": sec(log.gemini_upload_ms),
            "Tunggu File ACTIVE (dtk)": sec(log.file_active_ms),
            "generateContent (dtk)": sec(log.generate_ms),
            "Total Server (dtk)": sec(log.total_ms),
            "Waktu Respon di App (dtk)": "",
            "Status Akhir": classify(log),
            "Catatan": log.error_message?.slice(0, 200) ?? "",
        }
    }
    return {
        ...common,
        "Durasi Target (mnt)": bucket === "unknown" ? "" : bucket,
        "Durasi Aktual (dtk)": log.video_duration_sec?.toFixed(1) ?? "",
        "Ukuran File (MB)": log.file_size_bytes ? (log.file_size_bytes / 1024 / 1024).toFixed(2) : "",
        "Terima File di Server (dtk)": sec(log.server_receive_ms),
        "Upload ke Gemini (dtk)": sec(log.gemini_upload_ms),
        "Tunggu File ACTIVE (dtk)": sec(log.file_active_ms),
        "generateContent (dtk)": sec(log.generate_ms),
        "Simpan ke DB (dtk)": sec(log.save_ms),
        "Total Server (dtk)": sec(log.total_ms),
        "Total Dirasakan User (dtk)": sec(log.client_total_ms),
        "Jumlah Percobaan generate": log.generate_attempts,
        "Status Akhir": classify(log),
        "Tahap Gagal": log.failure_stage ?? "",
        "Catatan": log.error_message?.slice(0, 200) ?? "",
    }
}

async function main() {
    const logs = await prismaClient.processingLog.findMany({
        where: { kind, ...(label ? { experiment_label: label } : {}) },
        orderBy: { id: "asc" },
    })
    if (logs.length === 0) {
        console.log(`Tidak ada data processing_logs untuk kind=${kind}${label ? ` label=${label}` : ""}.`)
        return
    }

    const rows = logs.map(log => ({
        id: log.id,
        presentation_id: log.presentation_id,
        experiment_label: log.experiment_label,
        pipeline_mode: log.pipeline_mode,
        sample_label: log.sample_label,
        duration_bucket_min: bucketOf(log.video_duration_sec),
        video_duration_sec: log.video_duration_sec,
        file_size_mb: log.file_size_bytes ? (log.file_size_bytes / 1024 / 1024).toFixed(2) : "",
        outcome: classify(log),
        status: log.status,
        failure_stage: log.failure_stage,
        last_stage: log.current_stage,
        error_message: log.error_message,
        server_receive_s: sec(log.server_receive_ms),
        queue_s: sec(log.queue_ms),
        gemini_upload_s: sec(log.gemini_upload_ms),
        file_active_s: sec(log.file_active_ms),
        generate_s: sec(log.generate_ms),
        save_s: sec(log.save_ms),
        processing_s: sec(log.processing_ms),
        total_s: sec(log.total_ms),
        client_prepare_s: sec(log.client_prepare_ms),
        client_request_s: sec(log.client_request_ms),
        client_wait_s: sec(log.client_wait_ms),
        client_total_s: sec(log.client_total_ms),
        client_poll_count: log.client_poll_count,
        client_outcome: log.client_outcome,
        client_platform: log.client_platform,
        upload_attempts: log.upload_attempts,
        generate_attempts: log.generate_attempts,
        active_poll_count: log.active_poll_count,
        injected_faults: log.injected_faults,
        used_inline: log.used_inline,
        reused_gemini_file: log.reused_gemini_file,
        model: log.model,
        request_received_at: log.request_received_at?.toISOString(),
        processing_started_at: log.processing_started_at?.toISOString(),
        finished_at: log.finished_at?.toISOString(),
    }))

    const groups = new Map<string, { log: ProcessingLog; outcome: Outcome }[]>()
    for (const log of logs) {
        const outcome = classify(log)
        if (outcome === "RUNNING") continue
        const key = [log.experiment_label ?? "", log.pipeline_mode, bucketOf(log.video_duration_sec)].join("|")
        groups.set(key, [...(groups.get(key) ?? []), { log, outcome }])
    }

    const summary = [...groups.entries()]
        .map(([key, items]) => {
            const [experimentLabel, mode, bucket] = key.split("|")
            const ok = items.filter(i => i.outcome === "SUCCESS").map(i => i.log)
            const count = (o: Outcome) => items.filter(i => i.outcome === o).length
            const total = stats(ok.map(l => l.total_ms ?? 0))
            const pick = (field: keyof ProcessingLog) =>
                mean(ok.map(l => l[field]).filter((v): v is number => typeof v === "number"))
            return {
                experiment_label: experimentLabel,
                pipeline_mode: mode,
                duration_bucket_min: bucket,
                n: items.length,
                success: ok.length,
                silent_failure: count("SILENT_FAILURE"),
                failed: count("FAILED"),
                timeout: count("TIMEOUT"),
                stuck: count("STUCK"),
                failure_rate_pct: ((1 - ok.length / items.length) * 100).toFixed(1),
                mean_total_s: fmt(total.mean),
                median_total_s: fmt(total.median),
                sd_total_s: fmt(total.sd),
                p95_total_s: fmt(total.p95),
                min_total_s: fmt(total.min),
                max_total_s: fmt(total.max),
                mean_server_receive_s: fmt(pick("server_receive_ms")),
                mean_gemini_upload_s: fmt(pick("gemini_upload_ms")),
                mean_file_active_s: fmt(pick("file_active_ms")),
                mean_generate_s: fmt(pick("generate_ms")),
                mean_save_s: fmt(pick("save_ms")),
                mean_client_total_s: fmt(pick("client_total_ms")),
                mean_generate_attempts: mean(items.map(i => i.log.generate_attempts)).toFixed(2),
                mean_file_size_mb: (mean(items.map(i => i.log.file_size_bytes ?? 0)) / 1024 / 1024).toFixed(2),
            }
        })
        .sort((a, b) =>
            a.experiment_label.localeCompare(b.experiment_label) ||
            a.pipeline_mode.localeCompare(b.pipeline_mode) ||
            Number(a.duration_bucket_min) - Number(b.duration_bucket_min)
        )

    fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const rawPath = path.join(outDir, `processing_logs_${kind.toLowerCase()}_${stamp}.csv`)
    const summaryPath = path.join(outDir, `summary_${kind.toLowerCase()}_${stamp}.csv`)
    const templatePath = path.join(outDir, `template_${kind.toLowerCase()}_${stamp}.csv`)
    fs.writeFileSync(rawPath, toCsv(rows))
    fs.writeFileSync(summaryPath, toCsv(summary))
    const finished = logs.filter(log => classify(log) !== "RUNNING")
    fs.writeFileSync(templatePath, toCsv(finished.map((log, index) => toTemplateRow(log, index + 1))))

    console.table(summary.map(s => ({
        label: s.experiment_label,
        mode: s.pipeline_mode,
        "durasi(mnt)": s.duration_bucket_min,
        n: s.n,
        sukses: s.success,
        "gagal(%)": s.failure_rate_pct,
        "mean total(s)": s.mean_total_s,
        "median(s)": s.median_total_s,
        "upload(s)": s.mean_gemini_upload_s,
        "active(s)": s.mean_file_active_s,
        "generate(s)": s.mean_generate_s,
    })))
    console.log(`\nData mentah : ${rawPath}\nRingkasan   : ${summaryPath}\nUntuk xlsx  : ${templatePath}`)
}

main()
    .catch(error => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => prismaClient.$disconnect())
