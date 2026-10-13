// Decides what to tell the user while the assistant is working.
// Pure functions, so the wording rules are easy to test.

type Part = { type: string; state?: string; text?: string };
type Message = { role: string; parts: Part[] };

const TOOL_LABELS: Record<string, string> = {
  "tool-searchWorkers": "Searching for workers",
  "tool-getQuote": "Checking the price",
  "tool-getCustomerAddress": "Looking up your saved address",
  "tool-prepareBooking": "Preparing your booking",
  "tool-getBookingStatus": "Checking your bookings",
  "tool-getMyJobs": "Looking up your jobs",
  "tool-getEarnings": "Calculating your earnings",
  "tool-getPriceGuidance": "Checking typical prices",
  "tool-prepareJobAction": "Preparing the job action",
};

const DONE_STATES = new Set(["output-available", "output-error", "output-denied"]);

/**
 * The label to show right now, or null when nothing needs showing
 * (idle, or the reply text is already streaming in).
 */
export function getActivityLabel(messages: Message[], busy: boolean): string | null {
  if (!busy) return null;

  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return "Thinking";

  // A tool that has started but not finished.
  const running = [...last.parts].reverse().find((p) => p.type.startsWith("tool-") && !DONE_STATES.has(p.state ?? ""));
  if (running) return TOOL_LABELS[running.type] ?? "Working on it";

  const lastPart = last.parts[last.parts.length - 1];
  if (lastPart?.type === "text" && lastPart.text?.trim()) return null; // reply is streaming
  if (lastPart?.type.startsWith("tool-")) return "Putting it together";

  return "Thinking";
}

/** Extra reassurance when a step takes a while. */
export function getSlowHint(elapsedSeconds: number): string | null {
  if (elapsedSeconds >= 25) return "Taking longer than usual, hang tight";
  if (elapsedSeconds >= 8) return "Still working on it";
  return null;
}
