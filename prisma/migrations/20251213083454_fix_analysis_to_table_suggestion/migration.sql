/*
  Warnings:

  - You are about to drop the column `analysis` on the `answers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "answers" DROP COLUMN "analysis";

-- CreateTable
CREATE TABLE "suggestions" (
    "id" SERIAL NOT NULL,
    "answer_id" INTEGER NOT NULL,
    "pace" TEXT,
    "wpm" INTEGER,
    "clarity" DOUBLE PRECISION,
    "suggestion" TEXT,
    "filler_words_count" INTEGER,
    "filler_words_distinct" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suggestions_answer_id_key" ON "suggestions"("answer_id");

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
