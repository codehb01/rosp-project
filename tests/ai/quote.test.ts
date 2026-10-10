import { describe, it, expect } from "vitest";
import { computeQuote } from "@/lib/ai/quote";

describe("computeQuote", () => {
  it("returns null when no rate is set", () => {
    expect(computeQuote({ hourlyRate: null, minimumFee: null })).toBeNull();
    expect(computeQuote({ hourlyRate: 0, minimumFee: 0 })).toBeNull();
  });

  it("uses the hourly rate times hours", () => {
    expect(computeQuote({ hourlyRate: 300, minimumFee: null }, 2)).toEqual({
      amount: 600,
      hours: 2,
      basis: "hourly",
    });
  });

  it("applies the minimum fee when it is higher", () => {
    expect(computeQuote({ hourlyRate: 200, minimumFee: 500 }, 1)).toEqual({
      amount: 500,
      hours: 1,
      basis: "minimum_fee",
    });
  });

  it("works with only a minimum fee", () => {
    expect(computeQuote({ hourlyRate: null, minimumFee: 400 })?.amount).toBe(400);
  });

  it("falls back to 1 hour for invalid hours and caps at 24", () => {
    expect(computeQuote({ hourlyRate: 100, minimumFee: null }, -3)?.hours).toBe(1);
    expect(computeQuote({ hourlyRate: 100, minimumFee: null }, 99)?.hours).toBe(24);
  });
});
