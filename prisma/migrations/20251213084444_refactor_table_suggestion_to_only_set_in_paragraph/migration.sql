/*
  Warnings:

  - You are about to drop the `suggestions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "suggestions" DROP CONSTRAINT "suggestions_answer_id_fkey";

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "suggestion" TEXT;

-- DropTable
DROP TABLE "suggestions";
