import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Only read methods exist on the mock, so any attempt to write a job would throw.
const prismaMock = vi.hoisted(() => ({
  job: { findMany: vi.fn(), findFirst: vi.fn() },
  workerProfile: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

const statsMock = vi.hoisted(() => ({ getWorkerEarningsStats: vi.fn() }));
vi.mock("@/lib/services/worker-service", () => statsMock);

const priceMock = vi.hoisted(() => ({ getRangeForWorker: vi.fn() }));
vi.mock("@/lib/ai/market-price", () => priceMock);

import { createWorkerChatTools } from "@/lib/ai/tools/worker-tools";
import type { AuthenticatedUser } from "@/lib/api-auth";

const worker = { id: "worker-1", name: "Ramesh", role: "WORKER" } as unknown as AuthenticatedUser;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (t: any, input: unknown) => t.execute(input, {});

const job = (over: Record<string, unknown> = {}) => ({
  id: "job-1",
  description: "Fix leaking tap",
  status: "PENDING",
  paymentStatus: "PENDING",
  workerId: "worker-1",
  customerId: "cust-1",
  time: new Date("2030-01-01T04:30:00Z"),
  location: "Pune",
  charge: 500,
  workerEarnings: 450,
  customer: { name: "Asha" },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("getMyJobs", () => {
  it("only ever queries the signed-in worker's own jobs", async () => {
    prismaMock.job.findMany.mockResolvedValue([]);
    await run(createWorkerChatTools(worker).getMyJobs, {});
    expect(prismaMock.job.findMany.mock.calls[0][0].where).toEqual({ workerId: "worker-1" });
  });

  it("adds the status filter and respects the limit", async () => {
    prismaMock.job.findMany.mockResolvedValue([]);
    await run(createWorkerChatTools(worker).getMyJobs, { status: "PENDING", limit: 3 });
    const args = prismaMock.job.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ workerId: "worker-1", status: "PENDING" });
    expect(args.take).toBe(3);
  });

  it("maps jobs to a compact shape with the customer's name", async () => {
    prismaMock.job.findMany.mockResolvedValue([job()]);
    const out = await run(createWorkerChatTools(worker).getMyJobs, {});
    expect(out.jobs[0]).toMatchObject({ id: "job-1", status: "PENDING", customerName: "Asha", workerEarnings: 450 });
    expect(out.jobs[0].time).toBe("2030-01-01T04:30:00.000Z");
  });
});

describe("getEarnings", () => {
  it("returns rounded totals and the number of completed jobs, not the job list", async () => {
    statsMock.getWorkerEarningsStats.mockResolvedValue({
      total: 1234.567,
      thisMonth: 500.001,
      lastMonth: 400,
      monthlyChange: 25.0004,
      jobs: [{}, {}, {}],
    });
    const out = await run(createWorkerChatTools(worker).getEarnings, {});
    expect(statsMock.getWorkerEarningsStats).toHaveBeenCalledWith("worker-1");
    expect(out).toEqual({
      total: 1234.57,
      thisMonth: 500,
      lastMonth: 400,
      monthlyChangePercent: 25,
      completedJobs: 3,
      currency: "INR",
    });
  });
});

describe("getPriceGuidance", () => {
  it("returns the worker's own rates and the typical range", async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue({ hourlyRate: 300, minimumFee: 200, city: "Pune" });
    priceMock.getRangeForWorker.mockResolvedValue({ low: 400, median: 500, high: 600, sampleSize: 9, source: "market" });
    const out = await run(createWorkerChatTools(worker).getPriceGuidance, {});
    expect(prismaMock.workerProfile.findUnique.mock.calls[0][0].where).toEqual({ userId: "worker-1" });
    expect(out).toMatchObject({ hourlyRate: 300, minimumFee: 200, typicalRange: { median: 500 } });
  });

  it("still answers when the typical-price lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.workerProfile.findUnique.mockResolvedValue({ hourlyRate: 300, minimumFee: null, city: "Pune" });
    priceMock.getRangeForWorker.mockRejectedValue(new Error("db down"));
    const out = await run(createWorkerChatTools(worker).getPriceGuidance, {});
    expect(out.typicalRange).toBeNull();
    expect(out.hourlyRate).toBe(300);
  });

  it("reports a missing worker profile", async () => {
    prismaMock.workerProfile.findUnique.mockResolvedValue(null);
    expect(await run(createWorkerChatTools(worker).getPriceGuidance, {})).toEqual({ error: "Worker profile not found" });
  });
});

describe("prepareJobAction", () => {
  it("looks the job up scoped to this worker, so another worker's job is 'not found'", async () => {
    prismaMock.job.findFirst.mockResolvedValue(null);
    const out = await run(createWorkerChatTools(worker).prepareJobAction, { jobId: "someone-elses", action: "ACCEPT" });
    expect(prismaMock.job.findFirst.mock.calls[0][0].where).toEqual({ id: "someone-elses", workerId: "worker-1" });
    expect(out).toEqual({ ok: false, error: "Job not found" });
  });

  it("prepares an accept draft for a pending job without changing anything", async () => {
    prismaMock.job.findFirst.mockResolvedValue(job());
    const out = await run(createWorkerChatTools(worker).prepareJobAction, { jobId: "job-1", action: "ACCEPT" });
    expect(out.ok).toBe(true);
    expect(out.draft).toMatchObject({ jobId: "job-1", action: "ACCEPT", customerName: "Asha", charge: 500 });
  });

  it("refuses to accept a job that is not pending", async () => {
    prismaMock.job.findFirst.mockResolvedValue(job({ status: "ACCEPTED" }));
    const out = await run(createWorkerChatTools(worker).prepareJobAction, { jobId: "job-1", action: "ACCEPT" });
    expect(out).toEqual({ ok: false, error: "Only pending jobs can be accepted" });
  });

  it("maps DECLINE to the existing CANCEL action and keeps the reason", async () => {
    prismaMock.job.findFirst.mockResolvedValue(job({ status: "ACCEPTED" }));
    const out = await run(createWorkerChatTools(worker).prepareJobAction, {
      jobId: "job-1",
      action: "DECLINE",
      reason: "Too far",
    });
    expect(out.ok).toBe(true);
    expect(out.draft).toMatchObject({ action: "CANCEL", reason: "Too far" });
  });

  it("refuses to decline a job that is already in progress", async () => {
    prismaMock.job.findFirst.mockResolvedValue(job({ status: "IN_PROGRESS" }));
    const out = await run(createWorkerChatTools(worker).prepareJobAction, { jobId: "job-1", action: "DECLINE" });
    expect(out.ok).toBe(false);
  });
});
