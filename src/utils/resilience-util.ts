import { PIPELINE_CONFIG } from "./pipeline-config"

export type PipelineStage =
    | "VALIDATION"
    | "UPLOAD"
    | "FILE_ACTIVE"
    | "GENERATE"
    | "PARSE"
    | "SAVE"
    | "DEADLINE"
    | "ORPHANED"

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const RETRYABLE_MESSAGE = /request aborted|aborterror|fetch failed|econnreset|etimedout|enotfound|eai_again|socket hang up|network/i

export class PipelineError extends Error {
    readonly stage: PipelineStage
    readonly retryable: boolean
    readonly isTimeout: boolean
    readonly status?: number

    constructor(
        stage: PipelineStage,
        message: string,
        options: { retryable?: boolean; isTimeout?: boolean; status?: number; cause?: unknown } = {}
    ) {
        super(message)
        this.name = "PipelineError"
        this.stage = stage
        this.retryable = options.retryable ?? false
        this.isTimeout = options.isTimeout ?? false
        this.status = options.status
        if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause
    }
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

// Error dari SDK Gemini berasal dari dua bundle berbeda (main & server), jadi dicek secara duck-typing
export function isRetryableError(error: unknown): boolean {
    if (error instanceof PipelineError) return error.retryable
    const status = (error as { status?: unknown })?.status
    if (typeof status === "number") return RETRYABLE_STATUS.has(status)
    return RETRYABLE_MESSAGE.test(errorMessage(error))
}

export function isTimeoutError(error: unknown): boolean {
    return error instanceof PipelineError && error.isTimeout
}

export function toPipelineError(error: unknown, stage: PipelineStage): PipelineError {
    if (error instanceof PipelineError) return error
    const status = (error as { status?: unknown })?.status
    return new PipelineError(stage, errorMessage(error), {
        retryable: isRetryableError(error),
        status: typeof status === "number" ? status : undefined,
        cause: error,
    })
}

function abortReason(signal: AbortSignal, stage: PipelineStage): PipelineError {
    const reason = (signal as { reason?: unknown }).reason
    if (reason instanceof PipelineError) return reason
    return new PipelineError(stage, "Operation aborted", { isTimeout: true })
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(abortReason(signal, "DEADLINE"))
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort)
            resolve()
        }, ms)
        const onAbort = () => {
            clearTimeout(timer)
            reject(abortReason(signal!, "DEADLINE"))
        }
        signal?.addEventListener("abort", onAbort, { once: true })
    })
}

/**
 * Menjalankan `fn` dengan batas waktu `ms` (0 = tanpa batas) dan ikut berhenti bila `parent` di-abort
 * (watchdog/deadline). `onLateResult` dipanggil jika `fn` baru selesai setelah timeout, untuk cleanup.
 */
export async function withTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    ms: number,
    stage: PipelineStage,
    parent?: AbortSignal,
    onLateResult?: (value: T) => void
): Promise<T> {
    const controller = new AbortController()
    let timer: NodeJS.Timeout | undefined
    const onParentAbort = () => controller.abort((parent as { reason?: unknown }).reason)

    const guard = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(abortReason(controller.signal, stage)), { once: true })
    })
    guard.catch(() => {})
    if (ms > 0) {
        timer = setTimeout(() => {
            controller.abort(new PipelineError(stage, `${stage} timed out after ${Math.round(ms / 1000)} seconds`, {
                retryable: true,
                isTimeout: true,
            }))
        }, ms)
    }
    if (parent) {
        if (parent.aborted) onParentAbort()
        else parent.addEventListener("abort", onParentAbort, { once: true })
    }

    if (controller.signal.aborted) {
        clearTimeout(timer)
        throw abortReason(controller.signal, stage)
    }

    const work = fn(controller.signal)
    try {
        return await Promise.race([work, guard])
    } catch (error) {
        work.then(onLateResult ?? (() => {}), () => {})
        throw error
    } finally {
        clearTimeout(timer)
        parent?.removeEventListener("abort", onParentAbort)
    }
}

// Gemini menyertakan RetryInfo (mis. "37s") pada error 429 kuota; hormati saran tersebut
export function retryAfterMs(error: unknown): number | undefined {
    const source = (error as { cause?: unknown })?.cause ?? error
    const details = (source as { errorDetails?: unknown })?.errorDetails
    if (!Array.isArray(details)) return undefined
    for (const detail of details) {
        const match = /^(\d+(?:\.\d+)?)s$/.exec(String((detail as { retryDelay?: unknown })?.retryDelay ?? ""))
        if (match) return Math.round(Number(match[1]) * 1000)
    }
    return undefined
}

export function backoffDelay(attempt: number): number {
    const { retryBaseDelayMs, retryMaxDelayMs } = PIPELINE_CONFIG
    const exponential = retryBaseDelayMs * 2 ** (attempt - 1)
    const jitter = Math.random() * retryBaseDelayMs * 0.5
    return Math.min(Math.round(exponential + jitter), retryMaxDelayMs)
}
