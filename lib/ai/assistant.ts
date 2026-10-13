import "server-only";
import type { AuthenticatedUser } from "@/lib/api-auth";
import { createChatTools } from "@/lib/ai/tools";
import { createWorkerChatTools } from "@/lib/ai/tools/worker-tools";
import { buildSystemPrompt, buildWorkerSystemPrompt } from "@/lib/ai/prompt";

/**
 * Picks the prompt and tools for the signed-in user's role. A customer never
 * gets worker tools and a worker never gets customer tools. Returns null for
 * anyone else (e.g. an account that has not finished onboarding).
 */
export function getAssistant(user: AuthenticatedUser, now = new Date()) {
  if (user.role === "CUSTOMER") {
    return {
      instructions: buildSystemPrompt({ customerName: user.name, now }),
      tools: createChatTools(user),
    };
  }
  if (user.role === "WORKER") {
    return {
      instructions: buildWorkerSystemPrompt({ workerName: user.name, now }),
      tools: createWorkerChatTools(user),
    };
  }
  return null;
}
