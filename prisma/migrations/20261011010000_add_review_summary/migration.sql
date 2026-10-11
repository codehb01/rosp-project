-- CreateTable
CREATE TABLE "WorkerReviewSummary" (
    "workerId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerReviewSummary_pkey" PRIMARY KEY ("workerId")
);

-- AddForeignKey
ALTER TABLE "WorkerReviewSummary" ADD CONSTRAINT "WorkerReviewSummary_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
