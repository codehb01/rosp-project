// Turns whatever useChat reports into a message the customer can act on.
// Matches the codes sent by the chat route (lib/ai/errors.ts) and its HTTP error bodies.

export type FriendlyError = { text: string; canRetry: boolean };

export function friendlyChatError(message: string | undefined): FriendlyError {
  const m = message ?? "";

  if (m.includes("AI_RATE_LIMITED")) {
    return { text: "The assistant has reached its usage limit for now. Please try again a little later.", canRetry: false };
  }
  if (m.includes("AI_TIMEOUT")) {
    return { text: "The assistant took too long to answer.", canRetry: true };
  }
  if (m.includes("AI_MODEL_AUTH")) {
    return { text: "The assistant is not set up correctly right now. Please try again later.", canRetry: false };
  }
  if (m.includes("RATE_LIMIT_EXCEEDED")) {
    return { text: "You are sending messages too quickly. Please wait a moment.", canRetry: true };
  }
  if (m.includes("FORBIDDEN") || m.includes("403")) {
    return { text: "The assistant is available for customer accounts.", canRetry: false };
  }
  if (m.includes("UNAUTHORIZED") || m.includes("401")) {
    return { text: "Please sign in again to use the assistant.", canRetry: false };
  }
  if (m.includes("AI_DISABLED")) {
    return { text: "The assistant is currently switched off.", canRetry: false };
  }
  return { text: "Something went wrong reaching the assistant.", canRetry: true };
}
