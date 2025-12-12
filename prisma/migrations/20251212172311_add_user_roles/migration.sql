/*
  Warnings:

  - You are about to drop the column `is_guest` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'GUEST');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "is_guest",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';
