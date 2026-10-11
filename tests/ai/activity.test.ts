import { describe, it, expect } from "vitest";
import { getActivityLabel, getSlowHint } from "@/components/ai-chat/activity";

const user = { role: "user", parts: [{ type: "text", text: "plumber in Pune" }] };
const assistant = (...parts: { type: string; state?: string; text?: string }[]) => ({ role: "assistant", parts });

describe("getActivityLabel", () => {
  it("shows nothing when idle", () => {
    expect(getActivityLabel([user], false)).toBeNull();
  });

  it("says Thinking right after the customer sends a message", () => {
    expect(getActivityLabel([user], true)).toBe("Thinking");
    expect(getActivityLabel([], true)).toBe("Thinking");
  });

  it("names the tool that is running", () => {
    const m = assistant({ type: "tool-searchWorkers", state: "input-available" });
    expect(getActivityLabel([user, m], true)).toBe("Searching for workers");
    expect(getActivityLabel([user, assistant({ type: "tool-getQuote", state: "input-streaming" })], true)).toBe(
      "Checking the price"
    );
    expect(getActivityLabel([user, assistant({ type: "tool-prepareBooking", state: "input-available" })], true)).toBe(
      "Preparing your booking"
    );
  });

  it("falls back to a generic label for an unknown tool", () => {
    expect(getActivityLabel([user, assistant({ type: "tool-somethingNew", state: "input-available" })], true)).toBe(
      "Working on it"
    );
  });

  it("says Putting it together after a tool finishes and before the reply text", () => {
    const m = assistant({ type: "tool-searchWorkers", state: "output-available" });
    expect(getActivityLabel([user, m], true)).toBe("Putting it together");
  });

  it("treats a failed tool as finished", () => {
    const m = assistant({ type: "tool-searchWorkers", state: "output-error" });
    expect(getActivityLabel([user, m], true)).toBe("Putting it together");
  });

  it("hides the indicator once the reply text is streaming", () => {
    const m = assistant({ type: "tool-searchWorkers", state: "output-available" }, { type: "text", text: "Here are" });
    expect(getActivityLabel([user, m], true)).toBeNull();
  });

  it("keeps showing Thinking for an assistant message with no text yet", () => {
    expect(getActivityLabel([user, assistant({ type: "text", text: "  " })], true)).toBe("Thinking");
  });
});

describe("getSlowHint", () => {
  it("only appears after a while, and escalates", () => {
    expect(getSlowHint(3)).toBeNull();
    expect(getSlowHint(8)).toBe("Still working on it");
    expect(getSlowHint(25)).toBe("Taking longer than usual, hang tight");
  });
});
