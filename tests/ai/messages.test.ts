import { describe, it, expect } from "vitest";
import { stripReasoning } from "@/lib/ai/messages";

const msg = (role: string, ...parts: { type: string; text?: string }[]) => ({ id: role, role, parts });

describe("stripReasoning", () => {
  it("removes reasoning parts and keeps text and tool parts in order", () => {
    const out = stripReasoning([
      msg("user", { type: "text", text: "hi" }),
      msg(
        "assistant",
        { type: "reasoning", text: "thinking..." },
        { type: "tool-searchWorkers" },
        { type: "reasoning", text: "more" },
        { type: "text", text: "Hello" }
      ),
    ]);
    expect(out[0].parts).toEqual([{ type: "text", text: "hi" }]);
    expect(out[1].parts.map((p) => p.type)).toEqual(["tool-searchWorkers", "text"]);
  });

  it("keeps the other message fields and does not change the input", () => {
    const input = [msg("assistant", { type: "reasoning", text: "x" }, { type: "text", text: "y" })];
    const out = stripReasoning(input);
    expect(out[0].id).toBe("assistant");
    expect(out[0].role).toBe("assistant");
    expect(input[0].parts).toHaveLength(2);
  });

  it("handles an empty list and messages without reasoning", () => {
    expect(stripReasoning([])).toEqual([]);
    const plain = [msg("user", { type: "text", text: "a" })];
    expect(stripReasoning(plain)).toEqual(plain);
  });
});
