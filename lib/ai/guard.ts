import "server-only";
import { NextRequest } from "next/server";
import { protectApiRoute, type UserRole } from "@/lib/api-auth";
import { sendError } from "@/lib/api-response";
import { isAiEnabled } from "@/lib/ai/config";
import { checkUserRateLimit } from "@/lib/ai/rate-limit";

type GuardOptions = { role?: UserRole; limit?: number; windowMs?: number };

/**
 * Common checks for every AI route: feature flag, Clerk auth (and role),
 * then a per-user rate limit.
 */
export async function guardAiRoute(req: NextRequest, options: GuardOptions = {}) {
  if (!isAiEnabled()) {
    return { user: null, response: sendError("AI features are disabled", "AI_DISABLED", 404) };
  }

  const { user, response } = await protectApiRoute(req, options.role);
  if (response || !user) {
    return { user: null, response: response ?? sendError("Unauthorized", "UNAUTHORIZED", 401) };
  }

  const rl = checkUserRateLimit(`${req.nextUrl.pathname}:${user.id}`, options.limit, options.windowMs);
  if (!rl.success) {
    return { user: null, response: sendError("Too many requests", "RATE_LIMIT_EXCEEDED", 429) };
  }

  return { user, response: undefined };
}
