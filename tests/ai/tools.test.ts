import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  job: { findMany: vi.fn() },
  review: { groupBy: vi.fn() },
  workerProfile: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

vi.mock("@/lib/ai/review-summary", () => ({
  withReviewSummaries: async (workers: unknown[]) => workers,
}));

// Vector search is covered in worker-search.test.ts; keep it off here.
vi.mock("@/lib/ai/vector-search", () => ({ semanticWorkerIds: vi.fn().mockResolvedValue([]) }));

const searchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/worker-service", () => ({ searchWorkers: searchMock }));

import { createChatTools } from "@/lib/ai/tools";
import type { AuthenticatedUser } from "@/lib/api-auth";

const user = {
  id: "cust-1",
  name: "Asha",
  customerProfile: {
    address: "12 MG Road",
    city: "Pune",
    state: "MH",
    postalCode: "411001",
  },
} as unknown as AuthenticatedUser;

// Tool execute functions take (input, options); options are unused here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (t: any, input: unknown) => t.execute(input, {});

const future = () => new Date(Date.now() + 86_400_000).toISOString();

beforeEach(() => vi.clearAllMocks());

describe("getCustomerAddress", () => {
  it("returns the saved address as one line", async () => {
    const tools = createChatTools(user);
    expect(await run(tools.getCustomerAddress, {})).toEqual({
      address: "12 MG Road, Pune, MH, 411001",
    });
  });

  it("returns null when there is no profile", async () => {
    const tools = createChatTools({ ...user, customerProfile: null } as unknown as AuthenticatedUser);
    expect(await run(tools.getCustomerAddress, {})).toEqual({ address: null });
  });
});

describe("prepareBooking", () => {
  const input = {
    workerId: "w1",
    description: "Fix leaking tap",
    datetime: future(),
    location: "12 MG Road, Pune",
    charge: 500,
  };

  it("returns a draft without creating anything", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "w1", name: "Ramesh" });
    const out = await run(createChatTools(user).prepareBooking, input);

    expect(out.ok).toBe(true);
    expect(out.draft).toMatchObject({ workerId: "w1", workerName: "Ramesh", charge: 500 });
    // No write methods exist on the mock, so any create attempt would throw.
  });

  it("rejects a past date", async () => {
    const out = await run(createChatTools(user).prepareBooking, {
      ...input,
      datetime: "2000-01-01T10:00:00+05:30",
    });
    expect(out.ok).toBe(false);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an unknown worker", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const out = await run(createChatTools(user).prepareBooking, input);
    expect(out).toEqual({ ok: false, error: "Worker not found" });
  });

  it("only looks up users with the WORKER role", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await run(createChatTools(user).prepareBooking, input);
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ role: "WORKER" });
  });
});

describe("getBookingStatus", () => {
  it("always scopes to the signed-in customer", async () => {
    prismaMock.job.findMany.mockResolvedValue([]);
    await run(createChatTools(user).getBookingStatus, { jobId: "someone-elses-job" });

    const where = prismaMock.job.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ customerId: "cust-1", id: "someone-elses-job" });
  });

  it("maps jobs to a compact shape", async () => {
    prismaMock.job.findMany.mockResolvedValue([
      {
        id: "j1",
        description: "Fix tap",
        status: "PENDING",
        paymentStatus: "PENDING",
        time: new Date("2030-01-01T04:30:00Z"),
        location: "Pune",
        charge: 500,
        worker: { name: "Ramesh" },
      },
    ]);
    const out = await run(createChatTools(user).getBookingStatus, {});
    expect(out.jobs[0]).toMatchObject({ id: "j1", status: "PENDING", workerName: "Ramesh" });
  });
});

describe("searchWorkers", () => {
  const worker = (id: string, city: string) => ({
    id,
    name: id,
    workerProfile: { skilledIn: ["plumber"], city, availableAreas: [] },
  });

  it("filters by city and attaches ratings", async () => {
    searchMock.mockResolvedValue({ workers: [worker("a", "Pune"), worker("b", "Delhi")] });
    prismaMock.review.groupBy.mockResolvedValue([
      { workerId: "a", _avg: { rating: 4.55 }, _count: { rating: 3 } },
    ]);

    const out = await run(createChatTools(user).searchWorkers, { skill: "plumber", city: "pune" });

    expect(out.workers).toHaveLength(1);
    expect(out.workers[0]).toMatchObject({ id: "a", rating: 4.6, reviewCount: 3 });
  });

  it("returns an empty list when nothing matches", async () => {
    searchMock.mockResolvedValue({ workers: [] });
    expect(await run(createChatTools(user).searchWorkers, { skill: "x" })).toEqual({ workers: [] });
  });

  it("respects the limit", async () => {
    searchMock.mockResolvedValue({ workers: [worker("a", "Pune"), worker("b", "Pune"), worker("c", "Pune")] });
    prismaMock.review.groupBy.mockResolvedValue([]);
    const out = await run(createChatTools(user).searchWorkers, { limit: 2 });
    expect(out.workers).toHaveLength(2);
  });
});
