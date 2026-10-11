import { describe, it, expect } from "vitest";
import { getAiConfig } from "@/lib/ai/config";

const base = {
  LLM_BASE_URL: "https://api.groq.com/openai/v1/",
  LLM_API_KEY: "k",
  LLM_MODEL: "m",
};

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("getAiConfig", () => {
  it("is disabled by default", () => {
    expect(getAiConfig(env({})).enabled).toBe(false);
  });

  it("is disabled when the flag is on but no model is configured", () => {
    expect(getAiConfig(env({ AI_ENABLED: "true" })).enabled).toBe(false);
  });

  it("is disabled when a model is configured but the flag is off", () => {
    expect(getAiConfig(env({ ...base, AI_ENABLED: "false" })).enabled).toBe(false);
  });

  it("is enabled with the flag and a full primary model, trimming trailing slashes", () => {
    const cfg = getAiConfig(env({ ...base, AI_ENABLED: "true" }));
    expect(cfg.enabled).toBe(true);
    expect(cfg.llm?.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(cfg.fallback).toBeNull();
  });

  it("treats empty values as unset", () => {
    const cfg = getAiConfig(
      env({
        ...base,
        AI_ENABLED: "true",
        LLM_FALLBACK_BASE_URL: "https://openrouter.ai/api/v1",
        LLM_FALLBACK_API_KEY: "fk",
        LLM_FALLBACK_MODEL: "",
      })
    );
    expect(cfg.fallback).toBeNull();
  });

  it("reads a complete fallback", () => {
    const cfg = getAiConfig(
      env({
        ...base,
        AI_ENABLED: "true",
        LLM_FALLBACK_BASE_URL: "https://openrouter.ai/api/v1",
        LLM_FALLBACK_API_KEY: "fk",
        LLM_FALLBACK_MODEL: "fm",
      })
    );
    expect(cfg.fallback?.model).toBe("fm");
  });

  it("is disabled on an invalid base URL", () => {
    const cfg = getAiConfig(env({ ...base, LLM_BASE_URL: "nope", AI_ENABLED: "true" }));
    expect(cfg.enabled).toBe(false);
  });

  it("keeps reasoning on unless LLM_DISABLE_REASONING is exactly true", () => {
    expect(getAiConfig(env({ ...base, AI_ENABLED: "true" })).disableReasoning).toBe(false);
    expect(getAiConfig(env({ ...base, LLM_DISABLE_REASONING: "yes" })).disableReasoning).toBe(false);
    expect(getAiConfig(env({ ...base, LLM_DISABLE_REASONING: "true" })).disableReasoning).toBe(true);
  });
});
