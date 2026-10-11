import { z } from "zod";

// AI settings are validated separately from lib/env.ts so the app boots
// normally when none of them are set (AI is off by default).
const aiEnvSchema = z.object({
  AI_ENABLED: z.string().optional(),

  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),

  LLM_FALLBACK_BASE_URL: z.string().url().optional(),
  LLM_FALLBACK_API_KEY: z.string().optional(),
  LLM_FALLBACK_MODEL: z.string().optional(),

  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
});

export type Endpoint = { baseURL: string; apiKey: string; model: string };

export type AiConfig = {
  enabled: boolean;
  llm: Endpoint | null;
  fallback: Endpoint | null;
  embedding: Endpoint | null;
};

// Treat empty strings (e.g. `LLM_API_KEY=`) as unset.
function clean(env: NodeJS.ProcessEnv) {
  const out: Record<string, string> = {};
  for (const key of Object.keys(aiEnvSchema.shape)) {
    const value = env[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

function endpoint(
  baseURL?: string,
  apiKey?: string,
  model?: string
): Endpoint | null {
  if (!baseURL || !apiKey || !model) return null;
  return { baseURL: baseURL.replace(/\/+$/, ""), apiKey, model };
}

export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const parsed = aiEnvSchema.safeParse(clean(env));
  if (!parsed.success) {
    console.error("[ai] Invalid AI environment variables", parsed.error.flatten().fieldErrors);
    return { enabled: false, llm: null, fallback: null, embedding: null };
  }
  const e = parsed.data;
  const llm = endpoint(e.LLM_BASE_URL, e.LLM_API_KEY, e.LLM_MODEL);

  return {
    // Enabled only when the flag is on AND a primary model is configured.
    enabled: e.AI_ENABLED === "true" && llm !== null,
    llm,
    fallback: endpoint(
      e.LLM_FALLBACK_BASE_URL,
      e.LLM_FALLBACK_API_KEY,
      e.LLM_FALLBACK_MODEL
    ),
    embedding: endpoint(e.EMBEDDING_BASE_URL, e.EMBEDDING_API_KEY, e.EMBEDDING_MODEL),
  };
}

export function isAiEnabled(): boolean {
  return getAiConfig().enabled;
}
