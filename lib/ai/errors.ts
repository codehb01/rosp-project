// Classifies failures from the model call so the server can log the real cause
// and the client can show a useful message. Pure, so it is easy to test.

export type AiErrorCode = "AI_RATE_LIMITED" | "AI_TIMEOUT" | "AI_MODEL_AUTH" | "AI_UNAVAILABLE";

type ErrorLike = {
  name?: string;
  message?: string;
  statusCode?: number;
  responseBody?: string;
  cause?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : { message: String(error) };
}

/** Looks through `cause` chains, since the SDK wraps provider errors. */
function findStatus(error: ErrorLike, depth = 0): number | undefined {
  if (typeof error.statusCode === "number") return error.statusCode;
  if (depth < 3 && error.cause) return findStatus(asErrorLike(error.cause), depth + 1);
  return undefined;
}

export function classifyAiError(error: unknown): AiErrorCode {
  const e = asErrorLike(error);
  const status = findStatus(e);
  const text = `${e.message ?? ""} ${e.responseBody ?? ""}`.toLowerCase();

  if (e.name === "TimeoutError" || e.name === "AbortError" || text.includes("timed out")) return "AI_TIMEOUT";
  if (status === 429 || text.includes("rate limit")) return "AI_RATE_LIMITED";
  if (status === 401 || status === 403) return "AI_MODEL_AUTH";
  return "AI_UNAVAILABLE";
}

/** A log line with the real cause. Never includes request bodies or keys. */
export function describeAiError(error: unknown): string {
  const e = asErrorLike(error);
  const status = findStatus(e);
  const detail = (e.responseBody ?? e.message ?? "").toString().slice(0, 200);
  return `${classifyAiError(error)}${status ? ` (HTTP ${status})` : ""}: ${detail}`;
}
