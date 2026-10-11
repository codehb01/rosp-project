import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const nextMock = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => nextMock);

import { runInBackground } from "@/lib/ai/background";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runInBackground", () => {
  it("schedules the work with after() inside a request", async () => {
    nextMock.after.mockImplementation((task: () => Promise<void>) => void task());
    const work = vi.fn().mockResolvedValue(undefined);

    runInBackground("test", work);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));
    expect(nextMock.after).toHaveBeenCalledTimes(1);
  });

  it("swallows and logs errors from the work", async () => {
    nextMock.after.mockImplementation((task: () => Promise<void>) => void task());
    runInBackground("test", () => Promise.reject(new Error("boom")));

    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it("runs the work directly when called outside a request scope", async () => {
    nextMock.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const work = vi.fn().mockResolvedValue(undefined);

    expect(() => runInBackground("test", work)).not.toThrow();
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));
  });
});
