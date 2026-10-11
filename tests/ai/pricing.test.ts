import { describe, it, expect } from "vitest";
import {
  MIN_SAMPLES,
  classifyPrice,
  computeRange,
  percentile,
  seedRange,
  type PriceRange,
} from "@/lib/ai/pricing";

describe("percentile", () => {
  it("interpolates between values", () => {
    expect(percentile([100, 200, 300, 400, 500], 0.5)).toBe(300);
    expect(percentile([100, 200, 300, 400, 500], 0.25)).toBe(200);
    expect(percentile([100, 200], 0.5)).toBe(150);
  });

  it("handles one value and empty input", () => {
    expect(percentile([250], 0.9)).toBe(250);
    expect(percentile([], 0.5)).toBeNaN();
  });

  it("clamps p to the valid range", () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 5)).toBe(3);
  });
});

describe("computeRange", () => {
  it("returns null below the minimum sample size", () => {
    expect(computeRange(Array(MIN_SAMPLES - 1).fill(500))).toBeNull();
  });

  it("computes quartiles from real charges, in any input order", () => {
    const range = computeRange([500, 100, 300, 200, 400]);
    expect(range).toEqual({ low: 200, median: 300, high: 400, sampleSize: 5, source: "market" });
  });

  it("ignores zero, negative and non-finite charges", () => {
    const range = computeRange([0, -5, NaN, Infinity, 100, 200, 300, 400, 500]);
    expect(range?.sampleSize).toBe(5);
  });

  it("is not thrown off much by one extreme outlier", () => {
    const range = computeRange([400, 450, 500, 550, 600, 1_000_000]);
    expect(range?.high).toBeLessThan(1000);
  });
});

describe("seedRange", () => {
  it("matches common trades by keyword, case-insensitively", () => {
    expect(seedRange("Plumber")?.source).toBe("estimate");
    expect(seedRange("plumbing")?.sampleSize).toBe(0);
    expect(seedRange("ELECTRICIAN")).not.toBeNull();
  });

  it("returns null for an unknown skill", () => {
    expect(seedRange("astronaut")).toBeNull();
  });
});

describe("classifyPrice", () => {
  const market: PriceRange = { low: 400, median: 500, high: 600, sampleSize: 20, source: "market" };

  it("classifies against the quartiles", () => {
    expect(classifyPrice(300, market)).toBe("below_market");
    expect(classifyPrice(400, market)).toBe("fair");
    expect(classifyPrice(600, market)).toBe("fair");
    expect(classifyPrice(700, market)).toBe("slightly_high");
    expect(classifyPrice(750, market)).toBe("slightly_high");
    expect(classifyPrice(751, market)).toBe("high");
  });

  it("never judges a price against a rough estimate", () => {
    expect(classifyPrice(5000, { ...market, source: "estimate" })).toBeNull();
  });

  it("returns null without a range or with an unusable charge", () => {
    expect(classifyPrice(500, null)).toBeNull();
    expect(classifyPrice(0, market)).toBeNull();
    expect(classifyPrice(NaN, market)).toBeNull();
  });
});
