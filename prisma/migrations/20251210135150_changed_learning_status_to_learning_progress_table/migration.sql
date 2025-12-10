/*
  Warnings:

  - You are about to drop the column `status` on the `Learning` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Learning" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "LearningProgress" ADD COLUMN     "status" "LearningStatus" NOT NULL DEFAULT 'LOCKED';
