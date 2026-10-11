import "server-only";
import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { computeQuote } from "@/lib/ai/quote";
import { getPriceCheck } from "@/lib/ai/market-price";

export const getQuoteTool = tool({
  description:
    "Estimate the charge for a worker from their own rates. Returns amount null when the worker has not set a rate.",
  inputSchema: z.object({
    workerId: z.string().describe("User id of the worker, from searchWorkers"),
    hours: z.number().min(0.5).max(24).optional().describe("Expected hours, default 1"),
  }),
  execute: async ({ workerId, hours }) => {
    const profile = await prisma.workerProfile.findFirst({
      where: { userId: workerId, user: { role: "WORKER" } },
      select: { hourlyRate: true, minimumFee: true },
    });
    if (!profile) return { error: "Worker not found" };

    const quote = computeQuote(profile, hours ?? 1);
    // Typical market price, and how this quote compares. Null if unknown.
    const priceCheck = await getPriceCheck(workerId, quote?.amount ?? 0);

    if (!quote) {
      return {
        amount: null,
        message: "This worker has not set a rate. Ask the customer for a budget.",
        priceCheck,
      };
    }
    return { ...quote, currency: "INR", priceCheck };
  },
});
