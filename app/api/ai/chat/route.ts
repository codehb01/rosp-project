import { NextRequest } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { sendError } from "@/lib/api-response";
import { guardAiRoute } from "@/lib/ai/guard";
import { getChatModel } from "@/lib/ai/provider";
import { getAssistant } from "@/lib/ai/assistant";
import { stripReasoning } from "@/lib/ai/messages";

// Streaming responses may run up to 60 seconds (the Vercel Hobby maximum).
export const maxDuration = 60;

// Stop a bit before the platform limit so the client gets a clean error
// instead of a reset connection.
const MODEL_TIMEOUT_MS = 55_000;

const MAX_MESSAGES = 30;
const MAX_BODY_BYTES = 100_000;

export async function POST(req: NextRequest) {
  try {
    return await handleChat(req);
  } catch (error) {
    console.error("[ai] chat error", error);
    return sendError("Internal server error", "INTERNAL_ERROR", 500);
  }
}

async function handleChat(req: NextRequest) {
  const { user, response } = await guardAiRoute(req, { limit: 20 });
  if (response || !user) return response ?? sendError("Unauthorized", "UNAUTHORIZED", 401);

  // Prompt and tools depend on the role; other accounts (e.g. not onboarded) are refused.
  const assistant = getAssistant(user);
  if (!assistant) {
    return sendError("The assistant is available for customer and worker accounts", "FORBIDDEN", 403);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return sendError("Conversation is too long", "PAYLOAD_TOO_LARGE", 413);
  }

  let body: { messages?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return sendError("Invalid request", "VALIDATION_ERROR", 400);
  }

  const validated = await safeValidateUIMessages<UIMessage>({ messages: body.messages });
  if (!validated.success || validated.data.length === 0) {
    return sendError("Invalid messages", "VALIDATION_ERROR", 400);
  }

  // Keep only the most recent turns to bound cost and context size.
  const messages = validated.data.slice(-MAX_MESSAGES);

  const result = streamText({
    model: getChatModel(),
    instructions: assistant.instructions,
    // Drop hidden reasoning so providers that reject it do not 400 on follow-ups.
    messages: await convertToModelMessages(stripReasoning(messages)),
    tools: assistant.tools,
    stopWhen: isStepCount(5),
    maxOutputTokens: 700,
    abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });

  return createUIMessageStreamResponse({
    // Do not send the model's hidden reasoning to the browser.
    stream: toUIMessageStream({ stream: result.stream, sendReasoning: false }),
  });
}
