import "server-only";
import { generateText } from "ai";
import prisma from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/config";
import { getChatModel } from "@/lib/ai/provider";
import { runInBackground } from "@/lib/ai/background";
import {
  MAX_REVIEWS,
  REVIEW_SUMMARY_INSTRUCTIONS,
  buildReviewPrompt,
  hasEnoughReviews,
  parseReviewSummary,
} from "@/lib/ai/review-summary-utils";

export type WorkerReviewSummaryView = { summary: string; tags: string[] };

/**
 * Regenerates the summary for a worker (User id). Keeps the previous summary
 * when there are too few reviews or the model reply cannot be used.
 */
export async function refreshReviewSummary(workerId: string): Promise<void> {
  if (!isAiEnabled()) return;

  const [reviewCount, reviews] = await Promise.all([
    prisma.review.count({ where: { workerId } }),
    prisma.review.findMany({
      where: { workerId },
      orderBy: { createdAt: "desc" },
      take: MAX_REVIEWS,
      select: { rating: true, comment: true },
    }),
  ]);
  if (!hasEnoughReviews(reviewCount, reviews)) return;

  const { text } = await generateText({
    model: getChatModel(),
    instructions: REVIEW_SUMMARY_INSTRUCTIONS,
    prompt: buildReviewPrompt(reviews),
    temperature: 0,
    maxOutputTokens: 300,
  });

  const result = parseReviewSummary(text);
  if (!result) {
    console.warn("[ai] review summary reply could not be parsed; keeping previous summary");
    return;
  }

  await prisma.workerReviewSummary.upsert({
    where: { workerId },
    create: { workerId, ...result, reviewCount },
    update: { ...result, reviewCount, updatedAt: new Date() },
  });
}

/** Regenerates the summary after the response is sent. Never throws. */
export function scheduleReviewSummary(workerId: string): void {
  if (!isAiEnabled()) return;
  runInBackground("review summary", () => refreshReviewSummary(workerId));
}

/**
 * Adds `reviewSummary` to each worker (matched by User id). Does nothing when
 * AI is off, and returns the workers unchanged if the lookup fails (for
 * example before the migration is applied), so search never breaks.
 */
export async function withReviewSummaries<T extends { id: string }>(
  workers: T[]
): Promise<(T & { reviewSummary?: WorkerReviewSummaryView | null })[]> {
  if (!isAiEnabled() || workers.length === 0) return workers;

  try {
    const rows = await prisma.workerReviewSummary.findMany({
      where: { workerId: { in: workers.map((w) => w.id) } },
      select: { workerId: true, summary: true, tags: true },
    });
    const byWorker = new Map(rows.map((r) => [r.workerId, r]));

    return workers.map((w) => {
      const r = byWorker.get(w.id);
      return { ...w, reviewSummary: r ? { summary: r.summary, tags: r.tags } : null };
    });
  } catch (error) {
    console.error("[ai] could not load review summaries", error);
    return workers;
  }
}
