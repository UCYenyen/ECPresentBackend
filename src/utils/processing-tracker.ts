import { performance } from "perf_hooks"
import { Prisma } from "@prisma/client"
import { prismaClient } from "./database-util"
import { PIPELINE_CONFIG } from "./pipeline-config"
import { PipelineError, PipelineStage, errorMessage, toPipelineError } from "./resilience-util"

export type ProcessingKind = "VIDEO" | "ANSWER"
export type ProcessingStatus = "RUNNING" | "SUCCESS" | "FALLBACK" | "FAILED" | "TIMEOUT"
export type CurrentStage = "QUEUED" | "UPLOADING" | "WAITING_ACTIVE" | "GENERATING" | "SAVING" | "DONE"
type DurationField = "gemini_upload_ms" | "file_active_ms" | "generate_ms" | "save_ms"
type CounterField = "upload_attempts" | "generate_attempts" | "active_poll_count" | "injected_faults"
type FlagField = "used_inline" | "reused_gemini_file"

interface AttemptRecord {
    stage: PipelineStage | "BACKOFF"
    attempt: number
    started_at: string
    ms: number
    ok: boolean
    error?: string
    injected?: "error" | "hang"
}

export interface TrackerStartOptions {
    kind: ProcessingKind
    presentationId?: number
    sampleLabel?: string
    experimentLabel?: string
    fileSizeBytes?: number
    videoDurationSec?: number
    mimeType?: string
    model?: string
    requestReceivedAt?: Date
    fileStoredAt?: Date
}

const msBetween = (from?: Date, to?: Date) => (from && to ? Math.max(0, to.getTime() - from.getTime()) : undefined)

/**
 * Mencatat timestamp & durasi setiap tahap pipeline Gemini ke tabel `processing_logs`
 * (dan ke console dengan prefix [TIMING]). Kegagalan menulis log tidak pernah menggagalkan pipeline.
 */
export class ProcessingTracker {
    // Log yang sedang diproses oleh proses Node ini (dipakai penyapu proses yatim)
    static readonly activeLogIds = new Set<number>()
    static readonly activePresentationIds = new Set<number>()

    private readonly controller = new AbortController()
    private readonly startedPerf = performance.now()
    private readonly startedAt = new Date()
    private readonly attempts: AttemptRecord[] = []
    private readonly durations: Partial<Record<DurationField, number>> = {}
    private readonly counters: Record<CounterField, number> = {
        upload_attempts: 0,
        generate_attempts: 0,
        active_poll_count: 0,
        injected_faults: 0,
    }
    private readonly flags: Record<FlagField, boolean> = { used_inline: false, reused_gemini_file: false }
    private failure?: PipelineError
    private finished = false

    private constructor(readonly logId: number | null, private readonly options: TrackerStartOptions) {}

    static async start(options: TrackerStartOptions): Promise<ProcessingTracker> {
        const config = PIPELINE_CONFIG
        let logId: number | null = null
        const processingStartedAt = new Date()
        try {
            const log = await prismaClient.processingLog.create({
                data: {
                    presentation_id: options.presentationId,
                    kind: options.kind,
                    pipeline_mode: config.mode,
                    experiment_label: options.experimentLabel || config.experimentLabel,
                    sample_label: options.sampleLabel,
                    file_size_bytes: options.fileSizeBytes,
                    video_duration_sec: options.videoDurationSec,
                    mime_type: options.mimeType,
                    model: options.model,
                    current_stage: "QUEUED",
                    request_received_at: options.requestReceivedAt,
                    processing_started_at: processingStartedAt,
                    server_receive_ms: msBetween(options.requestReceivedAt, options.fileStoredAt),
                    queue_ms: msBetween(options.fileStoredAt, processingStartedAt),
                    config: config as unknown as Prisma.InputJsonValue,
                },
            })
            logId = log.id
        } catch (error) {
            console.error("[Tracker] Failed to create processing log:", errorMessage(error))
        }

        const tracker = new ProcessingTracker(logId, options)
        if (logId !== null) ProcessingTracker.activeLogIds.add(logId)
        if (options.presentationId) ProcessingTracker.activePresentationIds.add(options.presentationId)
        console.log(`[TIMING] ${tracker.tag} START ${processingStartedAt.toISOString()} (mode=${config.mode})`)
        return tracker
    }

    get signal(): AbortSignal {
        return this.controller.signal
    }

    // true bila ada kegagalan yang ditutupi hasil mock (baseline)
    get hasFailure(): boolean {
        return this.failure !== undefined
    }

    private get tag(): string {
        const presentation = this.options.presentationId ? ` presentation#${this.options.presentationId}` : ""
        return `[${this.options.kind} log#${this.logId ?? "-"}${presentation}]`
    }

    private async write(data: Prisma.ProcessingLogUpdateInput): Promise<void> {
        if (this.logId === null) return
        try {
            await prismaClient.processingLog.update({ where: { id: this.logId }, data })
        } catch (error) {
            console.error(`[Tracker] ${this.tag} failed to write log:`, errorMessage(error))
        }
    }

    async setStage(stage: CurrentStage): Promise<void> {
        if (this.finished) return
        console.log(`[TIMING] ${this.tag} stage=${stage} t=${Math.round(performance.now() - this.startedPerf)}ms`)
        await this.write({ current_stage: stage })
    }

    increment(counter: CounterField): number {
        return ++this.counters[counter]
    }

    setFlag(flag: FlagField): void {
        this.flags[flag] = true
    }

    recordFault(kind: "error" | "hang", attempt: number): void {
        this.increment("injected_faults")
        this.attempts.push({ stage: "GENERATE", attempt, started_at: new Date().toISOString(), ms: 0, ok: false, injected: kind })
        console.warn(`[FAULT] ${this.tag} injected ${kind} on GENERATE attempt ${attempt}`)
    }

    recordBackoff(stage: PipelineStage, attempt: number, delayMs: number, error: unknown): void {
        this.attempts.push({ stage: "BACKOFF", attempt, started_at: new Date().toISOString(), ms: delayMs, ok: true, error: `${stage}: ${errorMessage(error)}` })
        console.warn(`[Retry] ${this.tag} ${stage} attempt ${attempt} failed (${errorMessage(error)}), retrying in ${delayMs}ms`)
    }

    // Menjalankan satu percobaan tahap dan mencatat durasinya (berhasil maupun gagal)
    async timed<T>(stage: PipelineStage, attempt: number, field: DurationField | null, fn: () => Promise<T>): Promise<T> {
        const startedAt = new Date()
        const t0 = performance.now()
        console.log(`[TIMING] ${this.tag} ${stage} #${attempt} start ${startedAt.toISOString()}`)
        const done = (ok: boolean, error?: unknown) => {
            const ms = Math.round(performance.now() - t0)
            if (field) this.durations[field] = (this.durations[field] ?? 0) + ms
            this.attempts.push({ stage, attempt, started_at: startedAt.toISOString(), ms, ok, error: error ? errorMessage(error) : undefined })
            console.log(`[TIMING] ${this.tag} ${stage} #${attempt} ${ok ? "done" : "failed"} ${ms}ms`)
        }
        try {
            const result = await fn()
            done(true)
            return result
        } catch (error) {
            done(false, error)
            throw error
        }
    }

    // Menyimpan penyebab kegagalan (mis. saat baseline menutupinya dengan hasil mock)
    noteFailure(error: unknown, stage: PipelineStage = "GENERATE"): void {
        this.failure = toPipelineError(error, stage)
    }

    abort(reason: PipelineError): void {
        if (!this.controller.signal.aborted) this.controller.abort(reason)
    }

    // Watchdog: batalkan seluruh proses bila melewati `deadlineMs` (0 = tanpa batas)
    async runWithDeadline<T>(deadlineMs: number, fn: () => Promise<T>): Promise<T> {
        if (deadlineMs <= 0) return fn()
        const deadline = new PipelineError("DEADLINE", `Processing exceeded deadline of ${Math.round(deadlineMs / 1000)} seconds`, { isTimeout: true })
        const timer = setTimeout(() => this.abort(deadline), deadlineMs)
        const aborted = new Promise<never>((_, reject) => {
            this.signal.addEventListener("abort", () => reject(deadline), { once: true })
        })
        aborted.catch(() => {})
        const work = fn()
        work.catch(() => {})
        try {
            return await Promise.race([work, aborted])
        } finally {
            clearTimeout(timer)
        }
    }

    async finish(status: Exclude<ProcessingStatus, "RUNNING">, error?: unknown): Promise<void> {
        if (this.finished) return
        this.finished = true
        if (error) this.noteFailure(error)
        if (this.logId !== null) ProcessingTracker.activeLogIds.delete(this.logId)
        if (this.options.presentationId) ProcessingTracker.activePresentationIds.delete(this.options.presentationId)

        const finishedAt = new Date()
        const processingMs = Math.round(performance.now() - this.startedPerf)
        const totalMs = msBetween(this.options.requestReceivedAt ?? this.startedAt, finishedAt)
        console.log(`[TIMING] ${this.tag} END status=${status} processing=${processingMs}ms total=${totalMs}ms`)

        await this.write({
            status,
            current_stage: "DONE",
            failure_stage: status === "SUCCESS" ? null : this.failure?.stage ?? null,
            error_message: status === "SUCCESS" ? null : this.failure?.message ?? null,
            finished_at: finishedAt,
            processing_ms: processingMs,
            total_ms: totalMs,
            ...this.durations,
            ...this.counters,
            ...this.flags,
            attempts: [...this.attempts] as unknown as Prisma.InputJsonValue,
        })
    }
}

/**
 * Menandai proses yang "yatim" (mis. server restart di tengah proses) sebagai FAILED,
 * supaya user tidak menunggu selamanya. Hanya aktif bila STALE_SWEEP_INTERVAL_MS > 0 (mode optimized).
 */
export function startStaleProcessingSweeper(): void {
    const { staleSweepIntervalMs, processingDeadlineMs } = PIPELINE_CONFIG
    if (staleSweepIntervalMs <= 0) return
    const staleAfterMs = (processingDeadlineMs > 0 ? processingDeadlineMs : 30 * 60_000) + 60_000

    const sweep = async () => {
        const staleBefore = new Date(Date.now() - staleAfterMs)
        try {
            const orphanLogs = await prismaClient.processingLog.updateMany({
                where: {
                    status: "RUNNING",
                    updatedAt: { lt: staleBefore },
                    id: { notIn: [...ProcessingTracker.activeLogIds] },
                },
                data: {
                    status: "FAILED",
                    failure_stage: "ORPHANED",
                    error_message: "Process was interrupted (server restart or crash) and never finished",
                    finished_at: new Date(),
                },
            })
            const orphanPresentations = await prismaClient.presentation.updateMany({
                where: {
                    status: "ONGOING",
                    feedback: { is: null },
                    updatedAt: { lt: staleBefore },
                    id: { notIn: [...ProcessingTracker.activePresentationIds] },
                },
                data: {
                    status: "FAILED",
                    failure_reason: "The analysis was interrupted on the server. Please upload your video again.",
                },
            })
            if (orphanLogs.count || orphanPresentations.count) {
                console.warn(`[Sweeper] Marked ${orphanLogs.count} log(s) and ${orphanPresentations.count} presentation(s) as FAILED`)
            }
        } catch (error) {
            console.error("[Sweeper] Failed:", errorMessage(error))
        }
    }

    sweep()
    setInterval(sweep, staleSweepIntervalMs).unref()
}
