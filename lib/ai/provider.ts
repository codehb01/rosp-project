import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getAiConfig, type Endpoint } from "@/lib/ai/config";

type FetchFn = typeof fetch;

const isRetryable = (status: number) => status === 429 || status >= 500;

function urlOf(input: Parameters<FetchFn>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

/**
 * Wraps fetch so a rate-limited or failing primary call is retried once
 * against the fallback endpoint. Works for streaming and non-streaming calls
 * because it operates on the raw HTTP request.
 */
export function withFallbackFetch(
  primary: Endpoint,
  fallback: Endpoint | null,
  baseFetch: FetchFn = fetch
): FetchFn {
  if (!fallback) return baseFetch;

  return async (input, init) => {
    let failure: string;
    try {
      const res = await baseFetch(input, init);
      if (!isRetryable(res.status)) return res;
      failure = String(res.status);
    } catch (err) {
      failure = err instanceof Error ? err.message : "network error";
    }

    console.warn(`[ai] primary model failed (${failure}); using fallback`);

    const url = urlOf(input);
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${fallback.apiKey}`);

    let body = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.stringify({ ...JSON.parse(body), model: fallback.model });
      } catch {
        // Non-JSON body: send as is.
      }
    }

    return baseFetch(fallback.baseURL + url.slice(primary.baseURL.length), {
      ...init,
      headers,
      body,
    });
  };
}

export function getChatModel() {
  const { llm, fallback } = getAiConfig();
  if (!llm) throw new Error("AI model is not configured");

  const provider = createOpenAICompatible({
    name: "llm",
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    fetch: withFallbackFetch(llm, fallback),
  });
  return provider.chatModel(llm.model);
}

export function getEmbeddingModel() {
  const { embedding } = getAiConfig();
  if (!embedding) throw new Error("Embedding model is not configured");

  const provider = createOpenAICompatible({
    name: "embeddings",
    baseURL: embedding.baseURL,
    apiKey: embedding.apiKey,
  });
  return provider.embeddingModel(embedding.model);
}
