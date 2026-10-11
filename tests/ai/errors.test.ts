import { describe, it, expect } from "vitest";
import { classifyAiError, describeAiError } from "@/lib/ai/errors";
import { friendlyChatError } from "@/components/ai-chat/errors";

const openRouter429 = {
  name: "AI_APICallError",
  statusCode: 429,
  message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
  responseBody: '{"error":{"message":"Rate limit exceeded: free-models-per-day","code":429}}',
};

describe("classifyAiError", () => {
  it("recognises the OpenRouter daily free-limit response", () => {
    expect(classifyAiError(openRouter429)).toBe("AI_RATE_LIMITED");
  });

  it("recognises a 429 by status alone, and by message alone", () => {
    expect(classifyAiError({ statusCode: 429 })).toBe("AI_RATE_LIMITED");
    expect(classifyAiError(new Error("Rate limit exceeded"))).toBe("AI_RATE_LIMITED");
  });

  it("finds the status inside a wrapped cause", () => {
    expect(classifyAiError({ message: "Failed after 3 attempts", cause: { statusCode: 429 } })).toBe("AI_RATE_LIMITED");
  });

  it("classifies timeouts and aborts", () => {
    expect(classifyAiError({ name: "TimeoutError", message: "The operation was aborted due to timeout" })).toBe("AI_TIMEOUT");
    expect(classifyAiError({ name: "AbortError" })).toBe("AI_TIMEOUT");
  });

  it("classifies bad model credentials", () => {
    expect(classifyAiError({ statusCode: 401 })).toBe("AI_MODEL_AUTH");
    expect(classifyAiError({ statusCode: 403 })).toBe("AI_MODEL_AUTH");
  });

  it("falls back to unavailable for anything else, including non-errors", () => {
    expect(classifyAiError({ statusCode: 500 })).toBe("AI_UNAVAILABLE");
    expect(classifyAiError("boom")).toBe("AI_UNAVAILABLE");
    expect(classifyAiError(undefined)).toBe("AI_UNAVAILABLE");
  });
});

describe("describeAiError", () => {
  it("includes the code, HTTP status and a trimmed detail for the logs", () => {
    const line = describeAiError(openRouter429);
    expect(line).toContain("AI_RATE_LIMITED (HTTP 429)");
    expect(line).toContain("free-models-per-day");
  });

  it("caps the detail length", () => {
    expect(describeAiError({ message: "x".repeat(5000) }).length).toBeLessThan(260);
  });
});

describe("friendlyChatError", () => {
  it("explains the usage limit and does not offer a pointless retry", () => {
    const e = friendlyChatError("AI_RATE_LIMITED");
    expect(e.text).toMatch(/usage limit/i);
    expect(e.canRetry).toBe(false);
  });

  it("offers a retry for timeouts and unknown errors", () => {
    expect(friendlyChatError("AI_TIMEOUT").canRetry).toBe(true);
    expect(friendlyChatError(undefined)).toEqual({ text: "Something went wrong reaching the assistant.", canRetry: true });
  });

  it("maps HTTP error bodies from the route", () => {
    expect(friendlyChatError('{"code":"FORBIDDEN"}').text).toMatch(/customer accounts/);
    expect(friendlyChatError('{"code":"UNAUTHORIZED"}').text).toMatch(/sign in/i);
    expect(friendlyChatError('{"code":"RATE_LIMIT_EXCEEDED"}').text).toMatch(/too quickly/i);
    expect(friendlyChatError('{"code":"AI_DISABLED"}').canRetry).toBe(false);
  });

  it("checks the specific AI codes before the generic ones", () => {
    expect(friendlyChatError("AI_MODEL_AUTH 403").text).toMatch(/not set up/i);
  });
});
