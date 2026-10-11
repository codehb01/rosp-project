import { NextRequest } from "next/server";
import { z } from "zod";
import { sendSuccess, sendError, withErrorHandling } from "@/lib/api-response";
import { guardAiRoute } from "@/lib/ai/guard";
import { getMarketRange, getRangeForWorker } from "@/lib/ai/market-price";

const querySchema = z
  .object({
    workerId: z.string().min(1).optional(),
    skill: z.string().trim().min(1).max(60).optional(),
    city: z.string().trim().max(60).optional(),
  })
  .refine((q) => q.workerId || q.skill, "workerId or skill is required");

/**
 * Typical job price for a worker's skill (?workerId=) or for a skill and
 * city (?skill=&city=). Returns aggregate figures only, never individual jobs.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const { response } = await guardAiRoute(req, { limit: 30 });
  if (response) return response;

  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return sendError("Invalid request", "VALIDATION_ERROR", 400, parsed.error.flatten().fieldErrors);
  }

  const { workerId, skill, city } = parsed.data;
  const range = workerId
    ? await getRangeForWorker(workerId)
    : await getMarketRange({ skill: skill as string, city });

  return sendSuccess({ range });
});
