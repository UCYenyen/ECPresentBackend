/*
  Warnings:

  - Changed the type of `expression` on the `Feedbacks` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `posture` on the `Feedbacks` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Feedbacks" DROP COLUMN "expression",
ADD COLUMN     "expression" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "intonation" SET DATA TYPE DOUBLE PRECISION,
DROP COLUMN "posture",
ADD COLUMN     "posture" DOUBLE PRECISION NOT NULL;
