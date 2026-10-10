export type RateCard = {
  hourlyRate: number | null;
  minimumFee: number | null;
};

export type Quote = {
  amount: number;
  hours: number;
  basis: "hourly" | "minimum_fee";
};

/**
 * Estimates a job charge from a worker's own rates.
 * Returns null when the worker has not set any rate.
 */
export function computeQuote(rates: RateCard, hours = 1): Quote | null {
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24) : 1;
  const hourly = rates.hourlyRate && rates.hourlyRate > 0 ? rates.hourlyRate : 0;
  const minimum = rates.minimumFee && rates.minimumFee > 0 ? rates.minimumFee : 0;

  if (!hourly && !minimum) return null;

  const byHour = hourly * safeHours;
  const amount = Math.round(Math.max(byHour, minimum));

  return {
    amount,
    hours: safeHours,
    basis: minimum > byHour ? "minimum_fee" : "hourly",
  };
}
