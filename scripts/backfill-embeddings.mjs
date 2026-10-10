// Embeds every worker profile for semantic search.
//   npm run ai:backfill-embeddings
// Needs the WorkerEmbedding migration applied and EMBEDDING_* set in .env.
// Safe to re-run: profiles whose text has not changed are skipped.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
// Plain TypeScript with no path aliases, so Node (22.18+) can load it directly.
import { EMBEDDING_DIMENSIONS, buildWorkerText, hashText, toVectorLiteral } from '../lib/ai/embedding-utils.ts'

const baseURL = process.env.EMBEDDING_BASE_URL?.replace(/\/+$/, '')
const apiKey = process.env.EMBEDDING_API_KEY
const model = process.env.EMBEDDING_MODEL

if (!baseURL || !apiKey || !model) {
  console.error('Set EMBEDDING_BASE_URL, EMBEDDING_API_KEY and EMBEDDING_MODEL in .env first.')
  process.exit(1)
}

const prisma = new PrismaClient()
const BATCH = 16

async function embedBatch(inputs) {
  const res = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: inputs }),
  })
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const vectors = [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Got ${v.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Check EMBEDDING_MODEL.`)
    }
  }
  return vectors
}

async function main() {
  const profiles = await prisma.workerProfile.findMany({
    select: {
      id: true, skilledIn: true, bio: true, qualification: true,
      city: true, state: true, availableAreas: true, yearsExperience: true,
    },
  })
  const existing = await prisma.$queryRaw`SELECT "workerProfileId", "contentHash" FROM "WorkerEmbedding"`
  const hashes = new Map(existing.map((r) => [r.workerProfileId, r.contentHash]))

  const todo = []
  for (const p of profiles) {
    const text = buildWorkerText(p)
    const contentHash = hashText(text)
    if (hashes.get(p.id) !== contentHash) todo.push({ id: p.id, text, contentHash })
  }
  console.log(`${profiles.length} workers, ${todo.length} need embedding`)

  let done = 0
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH)
    const vectors = await embedBatch(chunk.map((c) => c.text))
    for (let j = 0; j < chunk.length; j++) {
      const literal = toVectorLiteral(vectors[j])
      await prisma.$executeRaw`
        INSERT INTO "WorkerEmbedding" ("workerProfileId", "embedding", "contentHash", "updatedAt")
        VALUES (${chunk[j].id}, ${literal}::vector, ${chunk[j].contentHash}, NOW())
        ON CONFLICT ("workerProfileId")
        DO UPDATE SET "embedding" = EXCLUDED."embedding", "contentHash" = EXCLUDED."contentHash", "updatedAt" = NOW()`
    }
    done += chunk.length
    console.log(`embedded ${done}/${todo.length}`)
  }
  console.log('Done')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
