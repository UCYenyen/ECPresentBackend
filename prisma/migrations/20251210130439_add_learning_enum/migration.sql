/*
  Warnings:

  - You are about to drop the column `isCompleted` on the `LearningProgress` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('LOCKED', 'ONPROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "Learning" ADD COLUMN     "status" "LearningStatus" NOT NULL DEFAULT 'LOCKED';

-- AlterTable
ALTER TABLE "LearningProgress" DROP COLUMN "isCompleted";
