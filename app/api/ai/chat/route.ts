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
import { createChatTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/prompt";

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
  const { user, response } = await guardAiRoute(req, { role: "CUSTOMER", limit: 20 });
  if (response || !user) return response ?? sendError("Unauthorized", "UNAUTHORIZED", 401);

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
    instructions: buildSystemPrompt({ customerName: user.name }),
    messages: await convertToModelMessages(messages),
    tools: createChatTools(user),
    stopWhen: isStepCount(5),
    maxOutputTokens: 700,
    abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
