# Panduan Eksperimen: Latensi & Ketahanan Pipeline Feedback Gemini

Judul riset: *Optimasi Latensi dan Peningkatan Ketahanan Sistem Feedback Presentasi Asinkron Berbasis Gemini API pada Aplikasi Android ECPresent*

Backend sekarang mencatat waktu setiap tahap pipeline ke tabel `processing_logs`. Pipeline juga punya dua mode
yang dipilih lewat env, sehingga perbandingan **sebelum vs sesudah mitigasi** cukup dengan restart server.

| Mode | Perilaku |
|---|---|
| `PIPELINE_MODE=baseline` (default) | Perilaku asli: polling status file tiap 2 dtk maks. 60 dtk, tanpa timeout, tanpa retry. Error Gemini **ditutupi** dengan feedback mock skor 0 (presentasi tidak pernah berstatus FAILED). |
| `PIPELINE_MODE=optimized` | Timeout per tahap, retry + exponential backoff (mengikuti `retryDelay` dari Gemini saat 429), polling adaptif 1→5 dtk maks. 10 menit, **gagal secara eksplisit** (status FAILED + alasan ke user), watchdog 15 menit, penyapu proses yatim (mis. server restart), dan file video di Gemini dipakai ulang saat analisis jawaban QnA (tidak di-upload ulang). |

---

## 1. Setup (sekali saja)

```bash
cd ECPresentBackend
npx prisma migrate deploy      # membuat tabel processing_logs + kolom baru di presentations
npx prisma generate
```

Tambahkan ke `.env` (lihat `.env.example` untuk semua opsi):

```env
MAX_VIDEO_SIZE_MB=300
PIPELINE_MODE=baseline
EXPERIMENT_LABEL=baseline
```

Saat server start, cek baris ini di console untuk memastikan mode yang aktif:

```
[Pipeline] mode=baseline | label=baseline | retry(gen=0, upload=0) | timeout(upload=0ms, generate=0ms, active=60000ms) | failFast=false | ...
```

Aplikasi Android sekarang mem-polling `GET /presentations/:id/analysis` setelah upload, menampilkan tahap proses,
menampilkan dialog bila analisis gagal, dan mengirim waktu sisi client ke `POST /presentations/:id/client-metrics`.

## 2. Variabel yang diukur

| Variabel | Kolom `processing_logs` | Keterangan |
|---|---|---|
| Durasi video (bebas) | `video_duration_sec` | Dibaca dari header MP4/MOV di server; fallback dari aplikasi (`MediaMetadataRetriever`) |
| Waktu terima file di server | `server_receive_ms` | Body multipart mulai dibaca → file tersimpan |
| Waktu upload ke Gemini File API | `gemini_upload_ms` | Total semua percobaan upload |
| Waktu tunggu file ACTIVE | `file_active_ms` | Termasuk jumlah polling di `active_poll_count` |
| Waktu `generateContent` | `generate_ms` | Total semua percobaan; jumlah percobaan di `generate_attempts` |
| Waktu simpan ke DB | `save_ms` | |
| **Total end-to-end (server)** | `total_ms` | Request diterima → feedback tersimpan & siap ditampilkan |
| **Total yang dirasakan user** | `client_total_ms` | User menekan Upload → hasil terlihat di aplikasi (termasuk upload dari HP & polling) |
| Status akhir | `status` | `SUCCESS`, `FALLBACK`, `FAILED`, `TIMEOUT`, atau `RUNNING` |

Detail per percobaan (termasuk jeda backoff dan fault yang disuntikkan) ada di kolom JSON `attempts`. Snapshot konfigurasi
saat run ada di kolom `config`. Console juga mencetak baris `[TIMING] ...` untuk setiap tahap.

> **Kenapa bukan sampai status COMPLETED?** Di ECPresent, status `COMPLETED` baru diset setelah user menjawab pertanyaan QnA,
> jadi waktunya bercampur dengan waktu manusia. Titik akhir yang dipakai adalah saat feedback video tersimpan (pertanyaan QnA siap).

### Definisi hasil (dipakai oleh script export)

| Outcome | Arti |
|---|---|
| `SUCCESS` | Analisis Gemini berhasil |
| `SILENT_FAILURE` | `status=FALLBACK`: Gemini gagal tetapi user tetap menerima feedback mock skor 0 tanpa tahu ada error (khas baseline) |
| `FAILED` | Gagal dan user diberi tahu (khas optimized) |
| `TIMEOUT` | Dihentikan karena melewati batas waktu |
| `STUCK` | Masih `RUNNING` tanpa progres lebih dari ambang (`--stuck-min`, default 5 menit) |

## 3. Sampel video

| Durasi | Jumlah sampel |
|---|---|
| 1 menit | 3 |
| 3 menit | 3 |
| 5 menit | 3 |
| 8 menit | 3 |

Supaya ukuran file tidak jadi variabel pengganggu, samakan encoding semua video (sisi pendek 720 px, 30 fps, ±1,5 Mbps,
audio AAC 128 kbps ≈ 12 MB/menit, jadi 8 menit ≈ 100 MB). Contoh dengan ffmpeg (filter `scale` ini menangani video potret
maupun lanskap; mode CBR `nal-hrd=cbr` menjaga ukuran per menit tetap sama walaupun isi videonya statis seperti slide):

```bash
ffmpeg -ss 0 -t 300 -i rekaman.mp4 -map 0:v:0 -map 0:a:0 -map_metadata -1 -vf "scale=w='if(gt(iw,ih),-2,720)':h='if(gt(iw,ih),720,-2)',fps=30,format=yuv420p" -c:v libx264 -b:v 1500k -minrate 1500k -maxrate 1500k -bufsize 1500k -x264-params "nal-hrd=cbr:force-cfr=1" -c:a aac -b:a 128k -ac 2 -ar 48000 -movflags +faststart 05min_01.mp4
```

Sampel yang dipakai di riset ini dibuat dengan `experiment/videos/buat_sampel.sh`; asal potongan tiap sampel tercatat di
`experiment/videos/daftar_sampel.csv` (folder ini lokal, tidak masuk git). Karena hanya ada satu rekaman ≥ 8 menit,
ketiga sampel 8 menit adalah video yang sama yang diunggah 3 kali (ulangan pengukuran).

Simpan di `experiment/videos/` (sudah di-gitignore) dengan nama yang menyebut durasi, mis. `01min_01.mp4` … `08min_03.mp4` (total 12 video).
Video HP biasa (1080p) bisa >100 MB per menit; turunkan bitrate dulu atau naikkan `MAX_VIDEO_SIZE_MB`.

## 4. Prosedur

Jalankan video **satu per satu** (runner sudah otomatis berurutan). Gunakan jaringan, mesin, dan model Gemini yang sama
untuk semua fase, dan catat waktu pengujian.

### Fase A: Baseline

```bash
# terminal 1
PIPELINE_MODE=baseline EXPERIMENT_LABEL=baseline npm run dev
# terminal 2
npm run experiment:run -- --dir experiment/videos --label baseline --cooldown-s 30
```

### Fase B: Optimized (sampel yang sama)

```bash
PIPELINE_MODE=optimized EXPERIMENT_LABEL=optimized npm run dev
npm run experiment:run -- --dir experiment/videos --label optimized --cooldown-s 30
```

Alternatifnya, upload lewat aplikasi Android satu per satu dan isi judul presentasi dengan nama sampel (mis. `05min_02`).
Judul dipakai sebagai `sample_label`.

### Fase C: Uji ketahanan dengan fault injection (untuk bagian *Significance*)

Gemini jarang gagal saat sepi, jadi kegagalan disimulasikan dengan laju yang sama di kedua mode:

```bash
# 30% panggilan generateContent gagal dengan 503
PIPELINE_MODE=baseline  EXPERIMENT_LABEL=baseline-fault30  FAULT_GENERATE_ERROR_RATE=0.3 npm run dev
PIPELINE_MODE=optimized EXPERIMENT_LABEL=optimized-fault30 FAULT_GENERATE_ERROR_RATE=0.3 npm run dev

# 20% panggilan "hang" 10 menit (baseline akan lambat/stuck, optimized timeout lalu retry)
PIPELINE_MODE=baseline  EXPERIMENT_LABEL=baseline-hang20  FAULT_GENERATE_HANG_RATE=0.2 npm run dev
PIPELINE_MODE=optimized EXPERIMENT_LABEL=optimized-hang20 FAULT_GENERATE_HANG_RATE=0.2 npm run dev
```

Untuk tiap konfigurasi server di atas, jalankan runner dengan `--label` yang sama. Kegagalan alami (mis. video 8 menit
melewati batas tunggu 60 detik di baseline, atau 429 kuota) tetap tercatat di Fase A/B.

### Fase D (opsional): Latensi tahap jawaban QnA

```bash
npm run experiment:run -- --dir experiment/videos --label optimized --answer-audio experiment/jawaban.m4a
npm run experiment:export -- --kind ANSWER
```

Di baseline, video presentasi di-upload ulang ke Gemini saat menganalisis jawaban. Di optimized, file yang sama dipakai ulang
(`reused_gemini_file = true`).

### Fase E (opsional): Ablasi

Setiap komponen bisa dinyalakan atau dimatikan sendiri, misalnya `PIPELINE_MODE=optimized MAX_GENERATE_RETRIES=0`
(tanpa retry) atau `INLINE_VIDEO_MAX_MB=18` (video kecil dikirim inline tanpa File API). Daftar lengkapnya ada di `.env.example`.

## 5. Export & ringkasan

```bash
npm run experiment:export                       # tahap VIDEO, semua label
npm run experiment:export -- --label baseline   # filter satu label
npm run experiment:export -- --stuck-min 10 --buckets 1,3,5,8
npm run experiment:export -- --decimal-comma    # Excel berformat Indonesia (pemisah ";" dan desimal ",")
```

Hasilnya ada di `experiment/results/`:

- `processing_logs_video_<waktu>.csv`: satu baris per proses (data mentah untuk grafik & uji statistik)
- `summary_video_<waktu>.csv`: per label × mode × bucket durasi berisi n, sukses, silent failure, failed, timeout, stuck,
  failure rate, mean/median/sd/p95/min/max total, dan rata-rata tiap tahap
- `template_video_<waktu>.csv` / `template_answer_<waktu>.csv`: kolomnya sama persis dengan spreadsheet template (lihat di bawah)
- `runner_<label>.csv`: hasil yang dicatat runner di sisi client

### Spreadsheet pencatatan

[`Template_Pencatatan_Pengujian.xlsx`](Template_Pencatatan_Pengujian.xlsx) berisi:

| Sheet | Isi |
|---|---|
| Petunjuk | Legenda warna, langkah pengisian, pemetaan kolom CSV, definisi status, contoh satu baris |
| Data Pengujian | Satu baris per video (500 baris; baris 6–53 sudah diberi label Fase A–C × 4 durasi × 3 sampel) |
| Ringkasan Latensi | Per durasi untuk Label A & B: n, tingkat gagal, mean/SD/median/P95/min/maks, rata-rata tiap tahap, dan tabel perbandingan A vs B |
| Ringkasan Ketahanan | SUCCESS / SILENT_FAILURE / FAILED / TIMEOUT / STUCK per label, tingkat gagal per durasi, kegagalan per tahap |
| Uji Berpasangan | Uji Wilcoxon signed-rank: video yang sama di Label A vs B, lengkap dengan W, nilai kritis exact, dan kesimpulan signifikan/tidak |
| Grafik | Durasi vs total waktu (server & user), rincian tahap (stacked), tingkat kegagalan per fase |
| Data QnA | Pencatatan tahap jawaban QnA (Fase D) beserta ringkasannya |

Cara cepat mengisi: buka `template_video_<waktu>.csv`, salin baris datanya (tanpa judul), lalu tempel di sheet
**Data Pengujian** mulai sel **A6**. Kolom abu-abu, ringkasan, dan grafik akan terhitung otomatis.

Query langsung ke database:

```sql
SELECT experiment_label, ROUND(video_duration_sec / 60) AS menit, status,
       gemini_upload_ms, file_active_ms, generate_ms, total_ms, client_total_ms, generate_attempts
FROM processing_logs
WHERE kind = 'VIDEO'
ORDER BY id;
```

## 6. Saran penyajian di bagian Result

1. **Tabel latensi**: durasi video × mode → mean ± sd, median, p95 `total_ms` (khusus yang sukses).
2. **Grafik garis**: durasi video (x) vs rata-rata total waktu (y), satu garis per mode, dengan error bar sd.
3. **Stacked bar per tahap**: upload / file active / generate per durasi, untuk menunjukkan tahap yang paling dominan.
4. **Tabel ketahanan**: proporsi SUCCESS / SILENT_FAILURE / FAILED / TIMEOUT / STUCK per mode (Fase A–C).
5. **Uji statistik**:
   - **Latensi:** karena 12 video yang sama dipakai di baseline dan optimized, gunakan **uji Wilcoxon signed-rank berpasangan**
     pada ke-12 video sekaligus (semua durasi digabung). Sheet *Uji Berpasangan* di spreadsheet sudah menghitungnya.
   - **Jangan uji per kelompok durasi.** Dengan hanya 3 video per kelompok, uji dua arah (mis. Mann-Whitney) tidak mungkin
     mencapai p < 0,05, berapa pun besar perbedaannya. Tampilkan per durasi secara deskriptif saja (rata-rata, SD, grafik).
   - **Tingkat kegagalan:** Fisher's exact test (mis. di JASP atau kalkulator online) dengan jumlah sukses/gagal tiap fase
     dari sheet *Ringkasan Ketahanan*.

## 7. Catatan & keterbatasan

- **Kuota Gemini**: video 8 menit ≈ 140 ribu token. Di free tier ini bisa memicu 429. Beri `--cooldown-s 60` di antara video
  panjang kalau ingin pengukuran yang bersih, atau laporkan 429 sebagai temuan ketahanan.
- **Memori**: SDK Gemini membaca seluruh file ke memori saat upload (±2× ukuran file).
- File di Gemini kedaluwarsa setelah 48 jam. Di mode optimized, file video disimpan sampai jawaban QnA dikirim
  atau presentasinya dihapus.
- Env dibaca sekali saat server start. Restart server setiap mengganti mode atau label.
- Baris `processing_logs` tetap ada walaupun presentasinya dihapus (`presentation_id` menjadi NULL).
