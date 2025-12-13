/*
  Warnings:

  - A unique constraint covering the columns `[question_id]` on the table `answers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[presentation_id]` on the table `questions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "answers_question_id_key" ON "answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_presentation_id_key" ON "questions"("presentation_id");
