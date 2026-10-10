import { describe, it, expect } from "vitest";
import { checkUserRateLimit } from "@/lib/ai/rate-limit";

describe("checkUserRateLimit", () => {
  it("blocks after the limit and resets after the window", () => {
    const t = 1_000;
    expect(checkUserRateLimit("u1", 2, 1000, t).success).toBe(true);
    expect(checkUserRateLimit("u1", 2, 1000, t).success).toBe(true);
    expect(checkUserRateLimit("u1", 2, 1000, t).success).toBe(false);
    expect(checkUserRateLimit("u1", 2, 1000, t + 1001).success).toBe(true);
  });

  it("tracks users independently", () => {
    expect(checkUserRateLimit("a", 1, 1000, 5).success).toBe(true);
    expect(checkUserRateLimit("b", 1, 1000, 5).success).toBe(true);
  });
});
