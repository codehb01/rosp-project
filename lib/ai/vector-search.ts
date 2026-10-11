import "server-only";
import prisma from "@/lib/prisma";
import { embedText, isEmbeddingEnabled } from "@/lib/ai/embeddings";
import { toVectorLiteral } from "@/lib/ai/embedding-utils";

// Cosine similarity below this is treated as unrelated. Measured with bge-m3 on
// a small sample: relevant Hindi/Marathi/English matches scored 0.49-0.60, an
// unrelated query scored up to 0.35. Re-check against real profiles.
export const MIN_SIMILARITY = 0.4;

/**
 * Returns worker user ids ranked by semantic similarity to the query.
 * Returns [] when embeddings are not configured; callers fall back to keywords.
 */
export async function semanticWorkerIds(query: string, limit = 20): Promise<string[]> {
  const text = query.trim();
  if (!text || !isEmbeddingEnabled()) return [];

  const literal = toVectorLiteral(await embedText(text));
  const rows = await prisma.$queryRaw<{ userId: string; score: number }[]>`
    SELECT wp."userId" AS "userId",
           1 - (we."embedding" <=> ${literal}::vector) AS score
    FROM "WorkerEmbedding" we
    JOIN "WorkerProfile" wp ON wp."id" = we."workerProfileId"
    JOIN "User" u ON u."id" = wp."userId"
    WHERE u."role" = 'WORKER'
    ORDER BY we."embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `;

  return rows.filter((r) => Number(r.score) >= MIN_SIMILARITY).map((r) => r.userId);
}
