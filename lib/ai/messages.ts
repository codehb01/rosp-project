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
