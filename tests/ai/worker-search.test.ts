import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  review: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

vi.mock("@/lib/ai/review-summary", () => ({
  withReviewSummaries: async (workers: unknown[]) => workers,
}));

const keywordMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/worker-service", () => ({ searchWorkers: keywordMock }));

const semanticMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/vector-search", () => ({ semanticWorkerIds: semanticMock }));

import { findWorkers } from "@/lib/ai/worker-search";

const w = (id: string, city = "Pune") => ({
  id,
  name: id,
  workerProfile: { skilledIn: ["plumber"], city, availableAreas: [] },
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.review.groupBy.mockResolvedValue([]);
  keywordMock.mockResolvedValue({ workers: [] });
  semanticMock.mockResolvedValue([]);
});

describe("findWorkers", () => {
  it("puts semantic matches before keyword matches and removes duplicates", async () => {
    semanticMock.mockResolvedValue(["s1", "k1"]);
    prismaMock.user.findMany.mockResolvedValue([w("k1"), w("s1")]);
    keywordMock.mockResolvedValue({ workers: [w("k1"), w("k2")] });

    const out = await findWorkers({ skill: "plumber", limit: 5 });
    expect(out.map((x) => x.id)).toEqual(["s1", "k1", "k2"]);
  });

  it("falls back to keyword results when vector search throws", async () => {
    semanticMock.mockRejectedValue(new Error("db has no vector extension"));
    keywordMock.mockResolvedValue({ workers: [w("k1")] });

    const out = await findWorkers({ skill: "plumber", limit: 3 });
    expect(out.map((x) => x.id)).toEqual(["k1"]);
  });

  it("uses the customer's own words for the semantic query when given", async () => {
    await findWorkers({ skill: "plumber", city: "Pune", query: "नल से पानी टपक रहा है", limit: 3 });
    expect(semanticMock).toHaveBeenCalledWith("नल से पानी टपक रहा है", 20);
  });

  it("builds a semantic query from skill and city otherwise", async () => {
    await findWorkers({ skill: "plumber", city: "Pune", limit: 3 });
    expect(semanticMock).toHaveBeenCalledWith("plumber Pune", 20);
  });

  it("filters by city and applies the limit", async () => {
    keywordMock.mockResolvedValue({ workers: [w("a"), w("b", "Delhi"), w("c"), w("d")] });
    const out = await findWorkers({ skill: "plumber", city: "pune", limit: 2 });
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("never returns users the semantic lookup could not load as workers", async () => {
    semanticMock.mockResolvedValue(["ghost"]);
    prismaMock.user.findMany.mockResolvedValue([]);
    expect(await findWorkers({ limit: 3 })).toEqual([]);
  });
});
