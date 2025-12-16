/*
  Warnings:

  - The values [LOCKED] on the enum `LearningStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LearningStatus_new" AS ENUM ('ONPROGRESS', 'COMPLETED');
ALTER TABLE "public"."learning_progresses" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "learning_progresses" ALTER COLUMN "status" TYPE "LearningStatus_new" USING ("status"::text::"LearningStatus_new");
ALTER TYPE "LearningStatus" RENAME TO "LearningStatus_old";
ALTER TYPE "LearningStatus_new" RENAME TO "LearningStatus";
DROP TYPE "public"."LearningStatus_old";
ALTER TABLE "learning_progresses" ALTER COLUMN "status" SET DEFAULT 'ONPROGRESS';
COMMIT;

-- AlterTable
ALTER TABLE "learning_progresses" ALTER COLUMN "status" SET DEFAULT 'ONPROGRESS';
