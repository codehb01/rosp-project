type Entry = { count: number; resetTime: number };

// Per-user, in-memory limiter for AI routes (each LLM call costs quota).
// Per serverless instance only, same trade-off as lib/rate-limit.ts.
const store = new Map<string, Entry>();

export function checkUserRateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000,
  now = Date.now()
): { success: boolean; remaining: number } {
  const entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) return { success: false, remaining: 0 };

  entry.count += 1;
  return { success: true, remaining: limit - entry.count };
}
