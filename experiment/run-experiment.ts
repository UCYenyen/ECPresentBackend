import fs from "fs"
import path from "path"
import { performance } from "perf_hooks"

// Mengunggah setiap video di sebuah folder SATU PER SATU ke backend (seperti yang dilakukan aplikasi Android),
// lalu polling hasil analisis sampai selesai/gagal, dan mencatat waktu sisi client.
//
// Pemakaian:
//   npm run experiment:run -- --dir experiment/videos --label baseline-run1
//
// Opsi:
//   --base-url http://localhost:3000   alamat backend
//   --token <jwt>                       token user (default: buat akun guest baru)
//   --repeat 1                          berapa kali seluruh folder diulang
//   --poll-ms 2000                      interval polling status analisis
//   --client-timeout-min 20             batas tunggu di sisi client sebelum dianggap STUCK
//   --cooldown-s 10                     jeda antar video (menghindari efek rate limit)
//   --answer-audio <file.m4a>           kirim jawaban QnA juga, untuk mengukur tahap ANSWER
//   --cleanup                           hapus presentasi setelah selesai (log eksperimen tetap tersimpan)

function arg(name: string, fallback?: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}
const flag = (name: string) => process.argv.includes(`--${name}`)

const baseUrl = (arg("base-url", process.env.EXPERIMENT_BASE_URL ?? "http://localhost:3000") as string).replace(/\/$/, "")
const dir = arg("dir")
const label = arg("label")
const repeat = Number(arg("repeat", "1"))
const pollMs = Number(arg("poll-ms", "2000"))
const clientTimeoutMs = Number(arg("client-timeout-min", "20")) * 60_000
const cooldownMs = Number(arg("cooldown-s", "10")) * 1000
const answerAudio = arg("answer-audio")
const cleanup = flag("cleanup")

const VIDEO_MIME: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mpeg": "video/mpeg",
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const seconds = (ms?: number) => (ms === undefined ? "" : (ms / 1000).toFixed(2))

interface RunResult {
    fileName: string
    sizeMb: number
    presentationId?: number
    outcome: string
    requestMs: number
    waitMs?: number
    totalMs?: number
    pollCount?: number
    lastStage?: string
    generateAttempts?: number
    failureReason?: string
    answerMs?: number
    answerOutcome?: string
}

async function api<T = any>(method: string, url: string, token?: string, body?: FormData | object): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    let payload: FormData | string | undefined
    if (body instanceof FormData) payload = body
    else if (body) {
        headers["Content-Type"] = "application/json"
        payload = JSON.stringify(body)
    }
    const response = await fetch(`${baseUrl}${url}`, { method, headers, body: payload })
    const text = await response.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { json = { raw: text } }
    return { status: response.status, json }
}

async function getToken(): Promise<string> {
    const provided = arg("token") ?? process.env.EXPERIMENT_TOKEN
    if (provided) return provided
    const { status, json } = await api("POST", "/api/guest")
    if (status !== 200 || !json?.data?.token) throw new Error(`Gagal membuat akun guest: ${status} ${JSON.stringify(json)}`)
    console.log(`Memakai akun guest baru: ${json.data.username}`)
    return json.data.token
}

function appendCsv(file: string, row: Record<string, unknown>) {
    const headers = Object.keys(row)
    const escape = (value: unknown) => {
        const text = value === null || value === undefined ? "" : String(value)
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    if (!fs.existsSync(file)) fs.writeFileSync(file, headers.join(",") + "\n")
    fs.appendFileSync(file, headers.map(h => escape(row[h])).join(",") + "\n")
}

async function runOne(token: string, filePath: string): Promise<RunResult> {
    const fileName = path.basename(filePath)
    const sizeMb = fs.statSync(filePath).size / 1024 / 1024
    const t0 = performance.now()

    const blob = await fs.openAsBlob(filePath, { type: VIDEO_MIME[path.extname(filePath).toLowerCase()] ?? "video/mp4" })
    const form = new FormData()
    form.append("title", fileName)
    form.append("sample_label", fileName)
    if (label) form.append("experiment_label", label)
    form.append("video", blob, fileName)
    const tPrepared = performance.now()

    const created = await api("POST", "/api/presentations", token, form)
    const tUploaded = performance.now()
    if (created.status !== 201) {
        console.error(`  ✗ upload gagal: ${created.status} ${JSON.stringify(created.json)}`)
        return { fileName, sizeMb, outcome: "UPLOAD_ERROR", requestMs: Math.round(tUploaded - tPrepared) }
    }
    const presentationId: number = created.json.data.id

    let outcome = "CLIENT_TIMEOUT"
    let pollCount = 0
    let lastStage = ""
    let failureReason = ""
    let generateAttempts: number | undefined
    while (performance.now() - tUploaded < clientTimeoutMs) {
        await sleep(pollMs)
        pollCount++
        try {
            const { status, json } = await api("GET", `/api/presentations/${presentationId}/analysis`, token)
            if (status !== 200) continue
            const data = json.data
            lastStage = data.processing?.stage ?? lastStage
            generateAttempts = data.processing?.generate_attempts ?? generateAttempts
            if (data.status === "FAILED") {
                outcome = "FAILED"
                failureReason = data.failure_reason ?? ""
                break
            }
            if (data.feedback && data.question) {
                outcome = data.processing?.status === "FALLBACK" ? "SILENT_FAILURE" : "SUCCESS"
                break
            }
            process.stdout.write(`\r  … ${Math.round((performance.now() - t0) / 1000)}s stage=${lastStage}      `)
        } catch {
            // error jaringan sementara saat polling: lanjut polling
        }
    }
    const tDone = performance.now()
    process.stdout.write("\n")

    const metrics = {
        client_platform: "runner",
        client_prepare_ms: Math.round(tPrepared - t0),
        client_request_ms: Math.round(tUploaded - tPrepared),
        client_wait_ms: Math.round(tDone - tUploaded),
        client_total_ms: Math.round(tDone - t0),
        client_poll_count: pollCount,
        client_outcome: outcome,
    }
    await api("POST", `/api/presentations/${presentationId}/client-metrics`, token, metrics).catch(() => {})

    let answerMs: number | undefined
    let answerOutcome: string | undefined
    if (answerAudio && outcome === "SUCCESS") {
        const audioForm = new FormData()
        audioForm.append("audio", await fs.openAsBlob(answerAudio, { type: "audio/mp4" }), path.basename(answerAudio))
        const tAnswer = performance.now()
        const answered = await api("POST", `/api/presentations/${presentationId}/answer`, token, audioForm)
        answerMs = Math.round(performance.now() - tAnswer)
        answerOutcome = answered.status === 201 ? "SUCCESS" : `HTTP_${answered.status}`
    }

    if (cleanup) await api("DELETE", `/api/presentations/${presentationId}`, token).catch(() => {})

    return {
        fileName,
        sizeMb,
        presentationId,
        outcome,
        requestMs: metrics.client_request_ms,
        waitMs: metrics.client_wait_ms,
        totalMs: metrics.client_total_ms,
        pollCount,
        lastStage,
        generateAttempts,
        failureReason,
        answerMs,
        answerOutcome,
    }
}

async function main() {
    if (!dir) throw new Error("Wajib isi --dir <folder video>")
    const files = fs.readdirSync(dir)
        .filter(f => VIDEO_MIME[path.extname(f).toLowerCase()])
        .sort()
        .map(f => path.join(dir, f))
    if (files.length === 0) throw new Error(`Tidak ada file video di ${dir}`)

    const token = await getToken()
    const resultsDir = path.join(__dirname, "results")
    fs.mkdirSync(resultsDir, { recursive: true })
    const csvPath = path.join(resultsDir, `runner_${label ?? "unlabeled"}.csv`)
    console.log(`${files.length} video x ${repeat} ulangan -> ${baseUrl} (hasil: ${csvPath})\n`)

    for (let run = 1; run <= repeat; run++) {
        for (const [index, file] of files.entries()) {
            console.log(`[run ${run}/${repeat}] [${index + 1}/${files.length}] ${path.basename(file)}`)
            const result = await runOne(token, file)
            console.log(`  -> ${result.outcome} total=${seconds(result.totalMs) || "-"}s ${result.failureReason ? `(${result.failureReason})` : ""}`)
            appendCsv(csvPath, {
                timestamp: new Date().toISOString(),
                experiment_label: label ?? "",
                run,
                file: result.fileName,
                size_mb: result.sizeMb.toFixed(2),
                presentation_id: result.presentationId,
                outcome: result.outcome,
                client_request_s: seconds(result.requestMs),
                client_wait_s: seconds(result.waitMs),
                client_total_s: seconds(result.totalMs),
                poll_count: result.pollCount,
                last_stage: result.lastStage,
                generate_attempts: result.generateAttempts,
                failure_reason: result.failureReason,
                answer_s: seconds(result.answerMs),
                answer_outcome: result.answerOutcome,
            })
            if (cooldownMs > 0) await sleep(cooldownMs)
        }
    }
    console.log(`\nSelesai. Jalankan "npm run experiment:export" untuk ringkasan dari database.`)
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
