// Pure helpers shared by the app and scripts/backfill-embeddings.mjs.
// Keep this file free of path-alias imports so Node can load it directly.
import { createHash } from "node:crypto";

// bge-m3 output size. Must match vector(1024) in the WorkerEmbedding migration.
export const EMBEDDING_DIMENSIONS = 1024;

export type WorkerTextInput = {
  skilledIn?: string[] | null;
  bio?: string | null;
  qualification?: string | null;
  city?: string | null;
  state?: string | null;
  availableAreas?: string[] | null;
  yearsExperience?: number | null;
};

// Skills are sometimes stored as a JSON string inside the array.
export function flatten(values: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of values ?? []) {
    const v = raw?.trim();
    if (!v) continue;
    if (v.startsWith("[") && v.endsWith("]")) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) {
          out.push(...parsed.filter((p): p is string => typeof p === "string" && !!p.trim()));
          continue;
        }
      } catch {
        // fall through and keep the raw value
      }
    }
    out.push(v);
  }
  return out;
}

/** The text that represents a worker for semantic search. */
export function buildWorkerText(w: WorkerTextInput): string {
  const parts = [
    `Skills: ${flatten(w.skilledIn).join(", ")}`,
    w.yearsExperience ? `Experience: ${w.yearsExperience} years` : "",
    w.qualification ? `Qualification: ${w.qualification}` : "",
    `Location: ${[w.city, w.state].filter(Boolean).join(", ")}`,
    flatten(w.availableAreas).length ? `Areas: ${flatten(w.availableAreas).join(", ")}` : "",
    w.bio ? `About: ${w.bio.trim()}` : "",
  ];
  return parts.filter((p) => p && !p.endsWith(": ")).join("\n");
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** pgvector text format, e.g. "[0.1,0.2]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
