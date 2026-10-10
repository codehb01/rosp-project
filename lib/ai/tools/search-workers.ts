import "server-only";
import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { searchWorkers } from "@/lib/services/worker-service";

const normalize = (s: string) => s.toLowerCase().trim();

export const searchWorkersTool = tool({
  description:
    "Search for workers by skill and optionally city. Returns the best matches; the app shows them as cards.",
  inputSchema: z.object({
    skill: z.string().optional().describe("Skill or trade, e.g. plumber, electrician"),
    city: z.string().optional().describe("City the customer is in, e.g. Pune"),
    limit: z.number().int().min(1).max(5).optional().describe("Max results, default 3"),
  }),
  execute: async ({ skill, city, limit }) => {
    const max = limit ?? 3;
    const { workers } = await searchWorkers({
      q: normalize(skill ?? ""),
      category: "",
      limit: 50,
      sort: "relevance",
    });

    const cityKey = city ? normalize(city) : "";
    const matches = workers
      .filter((w: { workerProfile?: { city?: string | null; availableAreas?: string[] | null } }) => {
        if (!cityKey) return true;
        const wp = w.workerProfile;
        return (
          normalize(wp?.city ?? "").includes(cityKey) ||
          (wp?.availableAreas ?? []).some((a) => normalize(a).includes(cityKey))
        );
      })
      .slice(0, max);

    if (matches.length === 0) return { workers: [] };

    const ratings = await prisma.review.groupBy({
      by: ["workerId"],
      where: { workerId: { in: matches.map((w: { id: string }) => w.id) } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const ratingByWorker = new Map(ratings.map((r) => [r.workerId, r]));

    return {
      workers: matches.map(
        (w: {
          id: string;
          name: string;
          workerProfile?: {
            skilledIn?: string[] | null;
            city?: string | null;
            yearsExperience?: number | null;
            hourlyRate?: number | null;
            minimumFee?: number | null;
            profilePic?: string | null;
          } | null;
        }) => {
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
        }
      ),
    };
  },
});
