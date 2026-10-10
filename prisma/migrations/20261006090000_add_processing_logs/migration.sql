-- AlterTable
ALTER TABLE "presentations" ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "gemini_file_expires_at" TIMESTAMP(3),
ADD COLUMN     "gemini_file_mime" TEXT,
ADD COLUMN     "gemini_file_name" TEXT,
ADD COLUMN     "gemini_file_uri" TEXT;

-- CreateTable
CREATE TABLE "processing_logs" (
    "id" SERIAL NOT NULL,
    "presentation_id" INTEGER,
    "kind" TEXT NOT NULL,
    "pipeline_mode" TEXT NOT NULL,
    "experiment_label" TEXT,
    "sample_label" TEXT,
    "file_size_bytes" INTEGER,
    "video_duration_sec" DOUBLE PRECISION,
    "mime_type" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "current_stage" TEXT,
    "failure_stage" TEXT,
    "error_message" TEXT,
    "request_received_at" TIMESTAMP(3),
    "processing_started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "server_receive_ms" INTEGER,
    "queue_ms" INTEGER,
    "gemini_upload_ms" INTEGER,
    "file_active_ms" INTEGER,
    "generate_ms" INTEGER,
    "save_ms" INTEGER,
    "processing_ms" INTEGER,
    "total_ms" INTEGER,
    "upload_attempts" INTEGER NOT NULL DEFAULT 0,
    "generate_attempts" INTEGER NOT NULL DEFAULT 0,
    "active_poll_count" INTEGER NOT NULL DEFAULT 0,
    "injected_faults" INTEGER NOT NULL DEFAULT 0,
    "used_inline" BOOLEAN NOT NULL DEFAULT false,
    "reused_gemini_file" BOOLEAN NOT NULL DEFAULT false,
    "client_platform" TEXT,
    "client_prepare_ms" INTEGER,
    "client_request_ms" INTEGER,
    "client_wait_ms" INTEGER,
    "client_total_ms" INTEGER,
    "client_poll_count" INTEGER,
    "client_outcome" TEXT,
    "attempts" JSONB,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_logs_presentation_id_idx" ON "processing_logs"("presentation_id");

-- CreateIndex
CREATE INDEX "processing_logs_pipeline_mode_kind_idx" ON "processing_logs"("pipeline_mode", "kind");

-- AddForeignKey
ALTER TABLE "processing_logs" ADD CONSTRAINT "processing_logs_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

