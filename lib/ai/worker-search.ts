import "server-only";
import prisma from "@/lib/prisma";
import { searchWorkers as keywordSearch } from "@/lib/services/worker-service";
import { semanticWorkerIds } from "@/lib/ai/vector-search";

type Candidate = {
  id: string;
  name: string;
  workerProfile?: {
    skilledIn?: string[] | null;
    city?: string | null;
    availableAreas?: string[] | null;
    yearsExperience?: number | null;
    hourlyRate?: number | null;
    minimumFee?: number | null;
    profilePic?: string | null;
  } | null;
};

export type FoundWorker = {
  id: string;
  name: string;
  skills: string[];
  city: string | null;
  yearsExperience: number | null;
  hourlyRate: number | null;
  minimumFee: number | null;
  profilePic: string | null;
  rating: number | null;
  reviewCount: number;
};

const normalize = (s: string) => s.toLowerCase().trim();

async function semanticCandidates(query: string): Promise<Candidate[]> {
  try {
    const ids = await semanticWorkerIds(query, 20);
    if (ids.length === 0) return [];

    const users = await prisma.user.findMany({
      where: { id: { in: ids }, role: "WORKER" },
      select: { id: true, name: true, workerProfile: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as Candidate] : []));
  } catch (error) {
    // Vector search is an enhancement; keyword search still works without it.
    console.error("[ai] semantic search failed, using keywords", error);
    return [];
  }
}

/**
 * Finds workers for the chat. Semantic matches come first (they understand
 * Hindi/Marathi and loose wording), then keyword matches fill the rest.
 */
export async function findWorkers(opts: {
  skill?: string;
  city?: string;
  query?: string;
  limit: number;
}): Promise<FoundWorker[]> {
  const { skill, city, query, limit } = opts;
  const semanticText = (query ?? [skill, city].filter(Boolean).join(" ")).trim();

  const [semantic, keyword] = await Promise.all([
    semanticCandidates(semanticText),
    keywordSearch({ q: normalize(skill ?? ""), category: "", limit: 50, sort: "relevance" }),
  ]);

  const seen = new Set<string>();
  const merged = [...semantic, ...(keyword.workers as Candidate[])].filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });

  const cityKey = city ? normalize(city) : "";
  const matches = merged
    .filter((w) => {
      if (!cityKey) return true;
      const wp = w.workerProfile;
      return (
        normalize(wp?.city ?? "").includes(cityKey) ||
        (wp?.availableAreas ?? []).some((a) => normalize(a).includes(cityKey))
      );
    })
    .slice(0, limit);

  if (matches.length === 0) return [];

  const ratings = await prisma.review.groupBy({
    by: ["workerId"],
    where: { workerId: { in: matches.map((w) => w.id) } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const ratingByWorker = new Map(ratings.map((r) => [r.workerId, r]));

  return matches.map((w) => {
    const r = ratingByWorker.get(w.id);
    return {
      id: w.id,
      name: w.name,
      skills: w.workerProfile?.skilledIn ?? [],
      city: w.workerProfile?.city ?? null,
      yearsExperience: w.workerProfile?.yearsExperience ?? null,
      hourlyRate: w.workerProfile?.hourlyRate ?? null,
      minimumFee: w.workerProfile?.minimumFee ?? null,
      profilePic: w.workerProfile?.profilePic ?? null,
      rating: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null,
      reviewCount: r?._count.rating ?? 0,
    };
  });
}
