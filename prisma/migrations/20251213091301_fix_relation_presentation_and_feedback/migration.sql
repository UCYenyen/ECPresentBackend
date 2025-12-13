/*
  Warnings:

  - A unique constraint covering the columns `[presentation_id]` on the table `feedbacks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "feedbacks_presentation_id_key" ON "feedbacks"("presentation_id");
