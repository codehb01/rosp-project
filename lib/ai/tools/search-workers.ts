import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { findWorkers } from "@/lib/ai/worker-search";

/**
 * Worker search for the chat. When the customer does not name a city, their
 * saved city is used so they do not have to be asked. If nobody is found there,
 * the search is repeated across all cities and flagged, so the customer still
 * sees options instead of an empty list.
 */
export function createSearchWorkersTool(opts: { defaultCity?: string | null } = {}) {
  return tool({
    description:
      "Search for workers by skill and optionally city. If no city is given, the customer's saved city is used. Returns the best matches; the app shows them as cards.",
    inputSchema: z.object({
      skill: z.string().optional().describe("Skill or trade, e.g. plumber, electrician"),
      city: z.string().optional().describe("City, only if the customer named one"),
      query: z
        .string()
        .optional()
        .describe("The customer's own words describing the need, in their language"),
      limit: z.number().int().min(1).max(5).optional().describe("Max results, default 3"),
    }),
    execute: async ({ skill, city, query, limit }) => {
      const max = limit ?? 3;
      const namedCity = city?.trim() || undefined;
      const searchCity = namedCity ?? (opts.defaultCity?.trim() || undefined);

      const workers = await findWorkers({ skill, city: searchCity, query, limit: max });
      if (workers.length > 0 || !searchCity) return { workers };

      // Nobody in that city: widen to all cities and say so.
      const anywhere = await findWorkers({ skill, query, limit: max });
      if (anywhere.length === 0) return { workers: [] };
      return { workers: anywhere, searchedCity: searchCity, noneInThatCity: true };
    },
  });
}
