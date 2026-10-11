import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { findWorkers } from "@/lib/ai/worker-search";

export const searchWorkersTool = tool({
  description:
    "Search for workers by skill and optionally city. Returns the best matches; the app shows them as cards.",
  inputSchema: z.object({
    skill: z.string().optional().describe("Skill or trade, e.g. plumber, electrician"),
    city: z.string().optional().describe("City the customer is in, e.g. Pune"),
    query: z
      .string()
      .optional()
      .describe("The customer's own words describing the need, in their language"),
    limit: z.number().int().min(1).max(5).optional().describe("Max results, default 3"),
  }),
  execute: async ({ skill, city, query, limit }) => ({
    workers: await findWorkers({ skill, city, query, limit: limit ?? 3 }),
  }),
});
