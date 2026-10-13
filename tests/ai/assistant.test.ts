import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/services/worker-service", () => ({ getWorkerEarningsStats: vi.fn(), searchWorkers: vi.fn() }));
vi.mock("@/lib/ai/market-price", () => ({ getPriceCheck: vi.fn(), getRangeForWorker: vi.fn() }));
vi.mock("@/lib/ai/worker-search", () => ({ findWorkers: vi.fn() }));

import { getAssistant } from "@/lib/ai/assistant";
import { buildSystemPrompt, buildWorkerSystemPrompt } from "@/lib/ai/prompt";
import type { AuthenticatedUser } from "@/lib/api-auth";

const user = (role: string) => ({ id: "u1", name: "Asha", role, customerProfile: null }) as unknown as AuthenticatedUser;

const CUSTOMER_ONLY = ["searchWorkers", "getQuote", "getCustomerAddress", "prepareBooking", "getBookingStatus"];
const WORKER_ONLY = ["getMyJobs", "getEarnings", "getPriceGuidance", "prepareJobAction"];

describe("getAssistant", () => {
  it("gives customers only customer tools", () => {
    const names = Object.keys(getAssistant(user("CUSTOMER"))!.tools);
    expect(names.sort()).toEqual([...CUSTOMER_ONLY].sort());
    for (const w of WORKER_ONLY) expect(names).not.toContain(w);
  });

  it("gives workers only worker tools", () => {
    const names = Object.keys(getAssistant(user("WORKER"))!.tools);
    expect(names.sort()).toEqual([...WORKER_ONLY].sort());
    for (const c of CUSTOMER_ONLY) expect(names).not.toContain(c);
  });

  it("refuses accounts that have not finished onboarding", () => {
    expect(getAssistant(user("UNASSIGNED"))).toBeNull();
    expect(getAssistant(user("SOMETHING_ELSE"))).toBeNull();
  });

  it("uses the matching system prompt for each role", () => {
    expect(getAssistant(user("CUSTOMER"))!.instructions).toContain("Customer: Asha");
    expect(getAssistant(user("WORKER"))!.instructions).toContain("Worker: Asha");
  });

  it("never offers a tool that changes a booking or job directly", () => {
    const all = [
      ...Object.keys(getAssistant(user("CUSTOMER"))!.tools),
      ...Object.keys(getAssistant(user("WORKER"))!.tools),
    ];
    for (const name of all) expect(name).not.toMatch(/^(create|accept|cancel|decline|confirm|start|complete)/i);
  });
});

describe("worker system prompt", () => {
  const prompt = buildWorkerSystemPrompt({ workerName: "Ramesh", now: new Date("2030-01-01T00:00:00Z") });

  it("states the safety rules", () => {
    expect(prompt).toContain("You cannot accept, decline or change anything yourself");
    expect(prompt).toContain("only see this worker's own jobs");
    expect(prompt).toContain("Never invent jobs");
    expect(prompt).toContain("Never make up a reason");
  });

  it("keeps starting jobs and payment out of the chat", () => {
    expect(prompt).toContain("proof photo");
    expect(prompt).toContain("do not try to do it here");
  });

  it("is a different prompt from the customer one", () => {
    const customer = buildSystemPrompt({ customerName: "Asha", now: new Date("2030-01-01T00:00:00Z") });
    expect(customer).not.toContain("prepareJobAction");
    expect(prompt).not.toContain("prepareBooking");
  });
});
