-- AlterTable
ALTER TABLE "feedbacks" ALTER COLUMN "audio_score" DROP NOT NULL,
ALTER COLUMN "overall_rating" DROP NOT NULL,
ALTER COLUMN "grade" DROP NOT NULL;
