import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withFallbackFetch, withReasoningOff } from "@/lib/ai/provider";

const primary = { baseURL: "https://p.test/v1", apiKey: "pk", model: "pm" };
const fallback = { baseURL: "https://f.test/v1", apiKey: "fk", model: "fm" };
const init = () => ({
  method: "POST",
  headers: { Authorization: "Bearer pk" },
  body: JSON.stringify({ model: "pm", messages: [] }),
});
const URL_ = "https://p.test/v1/chat/completions";

describe("withFallbackFetch", () => {
  it("returns the primary response when it succeeds", async () => {
    const base = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const f = withFallbackFetch(primary, fallback, base);
    expect((await f(URL_, init())).status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 against the fallback with its url, key and model", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(new Response("limit", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const f = withFallbackFetch(primary, fallback, base);

    expect((await f(URL_, init())).status).toBe(200);
    const [url, opts] = base.mock.calls[1];
    expect(url).toBe("https://f.test/v1/chat/completions");
    expect(new Headers(opts.headers).get("Authorization")).toBe("Bearer fk");
    expect(JSON.parse(opts.body).model).toBe("fm");
  });

  it("retries on a network error", async () => {
    const base = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const f = withFallbackFetch(primary, fallback, base);
    expect((await f(URL_, init())).status).toBe(200);
  });

  it("does not retry client errors like 400", async () => {
    const base = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    const f = withFallbackFetch(primary, fallback, base);
    expect((await f(URL_, init())).status).toBe(400);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("returns the plain fetch when no fallback is configured", () => {
    const base = vi.fn();
    expect(withFallbackFetch(primary, null, base as never)).toBe(base);
  });
});

describe("withReasoningOff", () => {
  const chatBody = JSON.stringify({ model: "m", messages: [] });

  it("adds reasoning: { enabled: false } to chat completion requests", async () => {
    const base = vi.fn().mockResolvedValue(new Response("ok"));
    await withReasoningOff(base)("https://p.test/v1/chat/completions", { method: "POST", body: chatBody });

    const sent = JSON.parse(base.mock.calls[0][1].body);
    expect(sent).toEqual({ model: "m", messages: [], reasoning: { enabled: false } });
  });

  it("leaves other endpoints untouched", async () => {
    const base = vi.fn().mockResolvedValue(new Response("ok"));
    const init = { method: "POST", body: JSON.stringify({ input: "x" }) };
    await withReasoningOff(base)("https://p.test/v1/embeddings", init);
    expect(base.mock.calls[0][1]).toBe(init);
  });

  it("passes a non-JSON body through unchanged", async () => {
    const base = vi.fn().mockResolvedValue(new Response("ok"));
    const init = { method: "POST", body: "not json" };
    await withReasoningOff(base)("https://p.test/v1/chat/completions", init);
    expect(base.mock.calls[0][1]).toBe(init);
  });

  it("still reaches the fallback with the flag when composed with it", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(new Response("limit", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const f = withReasoningOff(withFallbackFetch(primary, fallback, base));

    expect((await f(URL_, { method: "POST", headers: {}, body: chatBody })).status).toBe(200);
    const second = JSON.parse(base.mock.calls[1][1].body);
    expect(second).toMatchObject({ model: "fm", reasoning: { enabled: false } });
  });
});
