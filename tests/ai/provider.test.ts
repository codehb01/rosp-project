import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withFallbackFetch } from "@/lib/ai/provider";

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
