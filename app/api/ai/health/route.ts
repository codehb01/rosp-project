import { NextRequest } from "next/server";
import { generateText } from "ai";
import { sendSuccess, sendError, withErrorHandling } from "@/lib/api-response";
import { guardAiRoute } from "@/lib/ai/guard";
import { getChatModel } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/ai/config";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { response } = await guardAiRoute(req, { limit: 5 });
  if (response) return response;

  try {
    const { text } = await generateText({
      model: getChatModel(),
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 10,
    });
    const { llm, fallback } = getAiConfig();
    return sendSuccess({
      status: "ok",
      model: llm?.model,
      fallbackConfigured: fallback !== null,
      reply: text.trim(),
    });
  } catch (error) {
    console.error("[ai] health check failed", error);
    return sendError("AI model is unreachable", "AI_UNAVAILABLE", 502);
  }
});
