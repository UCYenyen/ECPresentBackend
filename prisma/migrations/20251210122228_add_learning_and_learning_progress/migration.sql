-- CreateTable
CREATE TABLE "Learning" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProgress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "learning_id" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_learning_id_fkey" FOREIGN KEY ("learning_id") REFERENCES "Learning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
