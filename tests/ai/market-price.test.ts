import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  job: { findMany: vi.fn() },
  workerProfile: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import {
  getMarketRange,
  getPriceCheck,
  getRangeForWorker,
  resetMarketPriceCache,
} from "@/lib/ai/market-price";

const job = (charge: number, skills: string[], city: string) => ({
  charge,
  worker: { workerProfile: { skilledIn: skills, city } },
});

const jobs = (charges: number[], skills: string[], city: string) => charges.map((c) => job(c, skills, city));

beforeEach(() => {
  vi.clearAllMocks();
  resetMarketPriceCache();
  prismaMock.job.findMany.mockResolvedValue([]);
});

describe("getMarketRange", () => {
  it("uses same-city jobs when there are enough", async () => {
    prismaMock.job.findMany.mockResolvedValue([
      ...jobs([100, 200, 300, 400, 500], ["plumber"], "Pune"),
      ...jobs([5000, 6000, 7000, 8000, 9000], ["plumber"], "Delhi"),
    ]);
    const range = await getMarketRange({ skill: "Plumber", city: "pune" });
    expect(range).toMatchObject({ median: 300, source: "market", sampleSize: 5 });
  });

  it("falls back to the skill across cities when the city has too few jobs", async () => {
    prismaMock.job.findMany.mockResolvedValue([
      ...jobs([100, 200], ["plumber"], "Pune"),
      ...jobs([300, 400, 500, 600], ["plumber"], "Delhi"),
    ]);
    const range = await getMarketRange({ skill: "plumber", city: "Pune" });
    expect(range).toMatchObject({ sampleSize: 6, source: "market" });
  });

  it("falls back to a rough estimate when there is too little data", async () => {
    prismaMock.job.findMany.mockResolvedValue(jobs([100, 200], ["plumber"], "Pune"));
    expect(await getMarketRange({ skill: "plumber", city: "Pune" })).toMatchObject({ source: "estimate" });
  });

  it("returns null for an unknown skill with no data", async () => {
    expect(await getMarketRange({ skill: "astronaut" })).toBeNull();
  });

  it("matches skills stored as JSON strings and ignores other trades", async () => {
    prismaMock.job.findMany.mockResolvedValue([
      ...jobs([100, 200, 300, 400, 500], ['["plumber","painter"]'], "Pune"),
      ...jobs([9000, 9000, 9000, 9000, 9000], ["electrician"], "Pune"),
    ]);
    const range = await getMarketRange({ skill: "plumber", city: "Pune" });
    expect(range?.high).toBe(400);
  });

  it("queries only completed jobs, and caches the result", async () => {
    await getMarketRange({ skill: "plumber" });
    await getMarketRange({ skill: "electrician" });

    expect(prismaMock.job.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.job.findMany.mock.calls[0][0].where).toMatchObject({ status: "COMPLETED" });
  });

  it("returns null for a blank skill without querying", async () => {
    expect(await getMarketRange({ skill: "  " })).toBeNull();
    expect(prismaMock.job.findMany).not.toHaveBeenCalled();
  });
});

describe("getRangeForWorker", () => {
  it("uses the worker's first skill and city", async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue({ skilledIn: ["Plumber", "Painter"], city: "Pune" });
    prismaMock.job.findMany.mockResolvedValue(jobs([100, 200, 300, 400, 500], ["plumber"], "Pune"));

    expect((await getRangeForWorker("w1"))?.median).toBe(300);
    expect(prismaMock.workerProfile.findUnique.mock.calls[0][0].where).toEqual({ userId: "w1" });
  });

  it("returns null when the worker has no profile or skills", async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(null);
    expect(await getRangeForWorker("w1")).toBeNull();
    prismaMock.workerProfile.findUnique.mockResolvedValue({ skilledIn: [], city: "Pune" });
    expect(await getRangeForWorker("w1")).toBeNull();
  });
});

describe("getPriceCheck", () => {
  beforeEach(() => {
    prismaMock.workerProfile.findUnique.mockResolvedValue({ skilledIn: ["plumber"], city: "Pune" });
    prismaMock.job.findMany.mockResolvedValue(jobs([400, 450, 500, 550, 600], ["plumber"], "Pune"));
  });

  it("returns a badge and the range", async () => {
    const check = await getPriceCheck("w1", 2000);
    expect(check?.badge).toBe("high");
    expect(check?.range.median).toBe(500);
  });

  it("returns no badge when judged against an estimate", async () => {
    prismaMock.job.findMany.mockResolvedValue([]);
    const check = await getPriceCheck("w1", 2000);
    expect(check?.badge).toBeNull();
    expect(check?.range.source).toBe("estimate");
  });

  it("returns null instead of throwing when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.workerProfile.findUnique.mockRejectedValue(new Error("db down"));
    expect(await getPriceCheck("w1", 500)).toBeNull();
  });
});
