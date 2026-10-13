// Helpers for the conversation history the browser sends back on every turn.

type Part = { type: string };
type MessageLike<P extends Part> = { parts: P[] };

/**
 * Removes the model's hidden "reasoning" parts from the history. Some
 * providers (e.g. Groq with gpt-oss) return their thinking, and the SDK would
 * send it back as `reasoning_content`, which those providers reject with a 400
 * on the next message. Reasoning is never needed to continue a conversation.
 */
export function stripReasoning<P extends Part, M extends MessageLike<P>>(messages: M[]): M[] {
  return messages.map((m) => ({ ...m, parts: m.parts.filter((p) => p.type !== "reasoning") }));
}

/**
 * Removes `reasoning_content` / `reasoning` from every message of a chat
 * completions request body (a JSON string). Within ONE reply the SDK sends the
 * model's own tool-call message back for the next step, including its hidden
 * thinking, and providers like Groq reject that field with a 400. Cleaning the
 * outgoing request covers every step, whatever the history looked like.
 * Returns the input unchanged when it is not a chat request or has nothing to remove.
 */
export function stripReasoningFromRequestBody(body: string): string {
  try {
    const json = JSON.parse(body);
    if (!json || !Array.isArray(json.messages)) return body;

    let changed = false;
    const messages = json.messages.map((m: unknown) => {
      if (m && typeof m === "object" && ("reasoning_content" in m || "reasoning" in m)) {
        changed = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { reasoning_content, reasoning, ...rest } = m as Record<string, unknown>;
        return rest;
      }
      return m;
    });
    return changed ? JSON.stringify({ ...json, messages }) : body;
  } catch {
    return body;
  }
}
