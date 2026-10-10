import "server-only";
import { after } from "next/server";
import { embed } from "ai";
import prisma from "@/lib/prisma";
import { getAiConfig } from "@/lib/ai/config";
import { getEmbeddingModel } from "@/lib/ai/provider";
import {
  EMBEDDING_DIMENSIONS,
  buildWorkerText,
  hashText,
  toVectorLiteral,
} from "@/lib/ai/embedding-utils";

export function isEmbeddingEnabled(): boolean {
  const cfg = getAiConfig();
  return cfg.enabled && cfg.embedding !== null;
}

export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await embed({ model: getEmbeddingModel(), value });
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding has ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Check EMBEDDING_MODEL.`
    );
  }
  return embedding;
}

/**
 * Recomputes a worker's embedding. Skips the model call when the profile text
 * is unchanged, which keeps free-tier quota for real changes.
 */
export async function refreshWorkerEmbedding(workerProfileId: string): Promise<void> {
  if (!isEmbeddingEnabled()) return;

  const profile = await prisma.workerProfile.findUnique({
    where: { id: workerProfileId },
    select: {
      skilledIn: true,
      bio: true,
      qualification: true,
      city: true,
      state: true,
      availableAreas: true,
      yearsExperience: true,
    },
  });
  if (!profile) return;

  const text = buildWorkerText(profile);
  const contentHash = hashText(text);

  const existing = await prisma.$queryRaw<{ contentHash: string }[]>`
    SELECT "contentHash" FROM "WorkerEmbedding" WHERE "workerProfileId" = ${workerProfileId}
  `;
  if (existing[0]?.contentHash === contentHash) return;

  const literal = toVectorLiteral(await embedText(text));
  await prisma.$executeRaw`
    INSERT INTO "WorkerEmbedding" ("workerProfileId", "embedding", "contentHash", "updatedAt")
    VALUES (${workerProfileId}, ${literal}::vector, ${contentHash}, NOW())
    ON CONFLICT ("workerProfileId")
    DO UPDATE SET "embedding" = EXCLUDED."embedding",
                  "contentHash" = EXCLUDED."contentHash",
                  "updatedAt" = NOW()
  `;
}

/**
 * Refreshes the embedding after the response is sent. Never throws: search
 * falls back to keywords, so a failed refresh must not break a profile save.
 */
export function scheduleEmbeddingRefresh(workerProfileId: string): void {
  if (!isEmbeddingEnabled()) return;

  const task = async () => {
    try {
      await refreshWorkerEmbedding(workerProfileId);
    } catch (error) {
      console.error("[ai] embedding refresh failed", error);
    }
  };

  try {
    after(task);
  } catch {
    // Outside a request scope (scripts, tests): run it directly.
    void task();
  }
}
