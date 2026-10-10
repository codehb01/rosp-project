-- Enable pgvector (supported on Neon, Supabase and most managed Postgres).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
-- Embeddings live in their own table so existing WorkerProfile queries
-- (including raw "wp.*" selects) are unaffected. 1024 = bge-m3 dimensions.
CREATE TABLE "WorkerEmbedding" (
    "workerProfileId" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerEmbedding_pkey" PRIMARY KEY ("workerProfileId")
);

-- AddForeignKey
ALTER TABLE "WorkerEmbedding" ADD CONSTRAINT "WorkerEmbedding_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "WorkerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
