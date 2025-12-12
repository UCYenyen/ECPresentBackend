/*
  Warnings:

  - Added the required column `audio_url` to the `Answer` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `overall_rating` on the `Feedbacks` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "audio_url" TEXT NOT NULL,
ADD COLUMN     "score" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Feedbacks" DROP COLUMN "overall_rating",
ADD COLUMN     "overall_rating" DOUBLE PRECISION NOT NULL;
