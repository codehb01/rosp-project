"use client";

import { useEffect, useState } from "react";
import { BADGE_LABEL, classifyPrice, type PriceBadge, type PriceRange } from "@/lib/ai/pricing";

type Props = {
  /** Look up by a worker's User id... */
  workerId?: string;
  /** ...or by skill (and optionally city). */
  skill?: string;
  city?: string;
  /** Charge to compare against the range. Omit to show the range only. */
  charge?: number;
};

const BADGE_STYLE: Record<PriceBadge, string> = {
  below_market: "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
  fair: "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300",
  slightly_high: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  high: "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300",
};

export function PriceInsight({ workerId, skill, city, charge }: Props) {
  const [range, setRange] = useState<PriceRange | null>(null);

  useEffect(() => {
    if (!workerId && !skill) return;
    const qs = new URLSearchParams();
    if (workerId) qs.set("workerId", workerId);
    else {
      qs.set("skill", skill as string);
      if (city) qs.set("city", city);
    }

    let cancelled = false;
    fetch(`/api/pricing?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setRange(json?.data?.range ?? null);
      })
      // Pricing hints are optional. Any failure (or AI being off) just hides them.
      .catch(() => {
        if (!cancelled) setRange(null);
      });

    return () => {
      cancelled = true;
    };
  }, [workerId, skill, city]);

  if (!range) return null;

  const badge = typeof charge === "number" ? classifyPrice(charge, range) : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {badge && (
        <span className={`rounded-full px-2 py-0.5 font-medium ${BADGE_STYLE[badge]}`}>{BADGE_LABEL[badge]}</span>
      )}
      <span>
        Typical price: ₹{range.low}–₹{range.high}
        {range.source === "estimate" ? " (rough estimate)" : ` (from ${range.sampleSize} completed jobs)`}
      </span>
    </div>
  );
}
