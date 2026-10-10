import "./env-util"

// Konfigurasi pipeline analisis Gemini untuk eksperimen latensi & ketahanan.
//
// PIPELINE_MODE=baseline  -> perilaku asli (polling 2s maks 60s, tanpa timeout, tanpa retry,
//                            error ditutupi dengan hasil mock skor 0)
// PIPELINE_MODE=optimized -> timeout per tahap, retry + exponential backoff, polling adaptif,
//                            gagal secara eksplisit (status FAILED), watchdog, dan reuse file Gemini untuk QnA
//
// Setiap nilai di bawah bisa di-override lewat env supaya bisa dilakukan uji ablasi.

export type PipelineMode = "baseline" | "optimized"

function envString(name: string): string | undefined {
    const value = process.env[name]
    return value === undefined || value.trim() === "" ? undefined : value.trim()
}

function envNumber(name: string, fallback: number): number {
    const value = envString(name)
    if (value === undefined) return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function envBool(name: string, fallback: boolean): boolean {
    const value = envString(name)
    if (value === undefined) return fallback
    return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

const mode: PipelineMode = envString("PIPELINE_MODE")?.toLowerCase() === "optimized" ? "optimized" : "baseline"
const optimized = mode === "optimized"

export const PIPELINE_CONFIG = {
    mode,
    experimentLabel: envString("EXPERIMENT_LABEL") ?? mode,

    // Retry (generateContent & upload)
    maxGenerateRetries: envNumber("MAX_GENERATE_RETRIES", optimized ? 2 : 0),
    maxUploadRetries: envNumber("MAX_UPLOAD_RETRIES", optimized ? 1 : 0),
    retryBaseDelayMs: envNumber("RETRY_BASE_DELAY_MS", 2000),
    retryMaxDelayMs: envNumber("RETRY_MAX_DELAY_MS", 30000),

    // Timeout per tahap (0 = tanpa timeout)
    uploadTimeoutMs: envNumber("UPLOAD_TIMEOUT_MS", optimized ? 5 * 60_000 : 0),
    generateTimeoutMs: envNumber("GENERATE_TIMEOUT_MS", optimized ? 4 * 60_000 : 0),

    // Menunggu file Gemini berstatus ACTIVE
    activeInitialIntervalMs: envNumber("ACTIVE_POLL_INITIAL_MS", optimized ? 1000 : 2000),
    activeMaxIntervalMs: envNumber("ACTIVE_POLL_MAX_MS", optimized ? 5000 : 2000),
    activeBackoffFactor: envNumber("ACTIVE_POLL_BACKOFF", optimized ? 1.5 : 1),
    activeTimeoutMs: envNumber("ACTIVE_TIMEOUT_MS", optimized ? 10 * 60_000 : 60_000),

    // true = error dilempar dan presentasi ditandai FAILED; false = hasil mock skor 0 (perilaku asli)
    failFast: envBool("FAIL_FAST", optimized),

    // Batas waktu total satu proses video (0 = tanpa batas) + penyapu proses yatim (mis. server restart)
    processingDeadlineMs: envNumber("PROCESSING_DEADLINE_MS", optimized ? 15 * 60_000 : 0),
    staleSweepIntervalMs: envNumber("STALE_SWEEP_INTERVAL_MS", optimized ? 60_000 : 0),

    // Optimasi latensi
    reuseGeminiFileForQna: envBool("REUSE_GEMINI_FILE_FOR_QNA", optimized),
    inlineVideoMaxMb: envNumber("INLINE_VIDEO_MAX_MB", 0),

    // Fault injection untuk menguji ketahanan (berlaku di kedua mode)
    faultGenerateErrorRate: envNumber("FAULT_GENERATE_ERROR_RATE", 0),
    faultGenerateHangRate: envNumber("FAULT_GENERATE_HANG_RATE", 0),
    faultHangMs: envNumber("FAULT_HANG_MS", 10 * 60_000),
}

export type PipelineConfig = typeof PIPELINE_CONFIG

export function describePipelineConfig(): string {
    const c = PIPELINE_CONFIG
    return [
        `mode=${c.mode}`,
        `label=${c.experimentLabel}`,
        `retry(gen=${c.maxGenerateRetries}, upload=${c.maxUploadRetries})`,
        `timeout(upload=${c.uploadTimeoutMs}ms, generate=${c.generateTimeoutMs}ms, active=${c.activeTimeoutMs}ms)`,
        `failFast=${c.failFast}`,
        `deadline=${c.processingDeadlineMs}ms`,
        `reuseQnaFile=${c.reuseGeminiFileForQna}`,
        `inlineMaxMb=${c.inlineVideoMaxMb}`,
        `faults(error=${c.faultGenerateErrorRate}, hang=${c.faultGenerateHangRate})`,
    ].join(" | ")
}
