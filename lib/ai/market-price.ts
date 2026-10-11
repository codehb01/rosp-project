import "server-only";
import prisma from "@/lib/prisma";
import { flatten } from "@/lib/ai/embedding-utils";
import {
  MIN_SAMPLES,
  classifyPrice,
  computeRange,
  seedRange,
  type PriceBadge,
  type PriceRange,
} from "@/lib/ai/pricing";

type CompletedJob = { charge: number; skills: string[]; city: string };

const CACHE_MS = 10 * 60 * 1000;
const MAX_JOBS = 1000;

let cache: { at: number; jobs: CompletedJob[] } | null = null;

const norm = (s: string) => s.toLowerCase().trim();

/** Recent completed jobs with their worker's skills and city. Cached briefly. */
async function loadCompletedJobs(now = Date.now()): Promise<CompletedJob[]> {
  if (cache && now - cache.at < CACHE_MS) return cache.jobs;

  const rows = await prisma.job.findMany({
    where: { status: "COMPLETED", charge: { gt: 0 }, worker: { workerProfile: { isNot: null } } },
    orderBy: { completedAt: "desc" },
    take: MAX_JOBS,
    select: {
      charge: true,
      worker: { select: { workerProfile: { select: { skilledIn: true, city: true } } } },
    },
  });

  const jobs = rows.map((r) => ({
    charge: r.charge,
    skills: flatten(r.worker?.workerProfile?.skilledIn).map(norm),
    city: norm(r.worker?.workerProfile?.city ?? ""),
  }));
  cache = { at: now, jobs };
  return jobs;
}

/** Test hook: forget cached jobs. */
export function resetMarketPriceCache() {
  cache = null;
}

/**
 * Typical price for a skill. Prefers jobs in the same city, then the skill
 * across all cities, then a rough built-in estimate, else null.
 */
export async function getMarketRange(opts: { skill: string; city?: string | null }): Promise<PriceRange | null> {
  const skill = norm(opts.skill);
  if (!skill) return null;

  const jobs = (await loadCompletedJobs()).filter((j) => j.skills.some((s) => s.includes(skill) || skill.includes(s)));

  const city = norm(opts.city ?? "");
  const local = city ? jobs.filter((j) => j.city === city) : [];

  if (local.length >= MIN_SAMPLES) return computeRange(local.map((j) => j.charge));
  return computeRange(jobs.map((j) => j.charge)) ?? seedRange(skill);
}

/** Range for a worker's primary skill and city. `workerId` is the User id. */
export async function getRangeForWorker(workerId: string): Promise<PriceRange | null> {
  const profile = await prisma.workerProfile.findUnique({
    where: { userId: workerId },
    select: { skilledIn: true, city: true },
  });
  const skill = flatten(profile?.skilledIn)[0];
  if (!profile || !skill) return null;
  return getMarketRange({ skill, city: profile.city });
}

export type PriceCheck = { badge: PriceBadge | null; range: PriceRange };

/** Range plus badge for a specific charge. Null if nothing is known or the lookup fails. */
export async function getPriceCheck(workerId: string, charge: number): Promise<PriceCheck | null> {
  try {
    const range = await getRangeForWorker(workerId);
    if (!range) return null;
    return { badge: classifyPrice(charge, range), range };
  } catch (error) {
    console.error("[ai] price check failed", error);
    return null;
  }
}
