// Pure pricing helpers. No server or node imports, so client components can
// use classifyPrice() to update the badge as the customer types.

export type PriceRange = {
  low: number; // 25th percentile
  median: number;
  high: number; // 75th percentile
  sampleSize: number;
  // "market" comes from completed jobs on the platform; "estimate" is a rough
  // default used until there is enough data.
  source: "market" | "estimate";
};

export type PriceBadge = "below_market" | "fair" | "slightly_high" | "high";

/** Completed jobs needed before a range is trusted as real market data. */
export const MIN_SAMPLES = 5;

export const BADGE_LABEL: Record<PriceBadge, string> = {
  below_market: "Below market",
  fair: "Fair price",
  slightly_high: "Slightly high",
  high: "High",
};

// Rough starting estimates in INR for a typical single job. They are
// placeholders for a new platform and should be replaced by real data as it
// builds up (see MIN_SAMPLES). They never drive a badge, only a hint.
const SEED_RANGES: { match: RegExp; low: number; median: number; high: number }[] = [
  { match: /plumb/i, low: 300, median: 500, high: 900 },
  { match: /electric/i, low: 300, median: 550, high: 1000 },
  { match: /carpent/i, low: 400, median: 800, high: 1500 },
  { match: /paint/i, low: 800, median: 1800, high: 3500 },
  { match: /clean/i, low: 400, median: 800, high: 1500 },
];

/** Linear-interpolated percentile of a sorted ascending array, p in [0, 1]. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Range from real charges, or null when there are too few to trust. */
export function computeRange(charges: number[]): PriceRange | null {
  const valid = charges.filter((c) => Number.isFinite(c) && c > 0).sort((a, b) => a - b);
  if (valid.length < MIN_SAMPLES) return null;

  return {
    low: Math.round(percentile(valid, 0.25)),
    median: Math.round(percentile(valid, 0.5)),
    high: Math.round(percentile(valid, 0.75)),
    sampleSize: valid.length,
    source: "market",
  };
}

export function seedRange(skill: string): PriceRange | null {
  const seed = SEED_RANGES.find((s) => s.match.test(skill));
  if (!seed) return null;
  return { low: seed.low, median: seed.median, high: seed.high, sampleSize: 0, source: "estimate" };
}

/**
 * Compares a charge to a range. Returns null for estimates: a placeholder
 * range is not a good enough reason to call someone's price high or low.
 */
export function classifyPrice(charge: number, range: PriceRange | null): PriceBadge | null {
  if (!range || range.source !== "market" || !Number.isFinite(charge) || charge <= 0) return null;

  if (charge < range.low) return "below_market";
  if (charge <= range.high) return "fair";
  if (charge <= range.high * 1.25) return "slightly_high";
  return "high";
}
