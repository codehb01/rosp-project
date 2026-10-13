import { describe, it, expect } from "vitest";
import { stripReasoning, stripReasoningFromRequestBody } from "@/lib/ai/messages";

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

describe("stripReasoningFromRequestBody", () => {
  const body = (messages: unknown[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({ model: "m", messages, ...extra });

  it("removes reasoning_content from assistant tool-call messages (the in-reply step 2 case)", () => {
    const out = JSON.parse(
      stripReasoningFromRequestBody(
        body([
          { role: "user", content: "earnings?" },
          { role: "assistant", content: "", tool_calls: [{ id: "c1" }], reasoning_content: "thinking..." },
          { role: "tool", tool_call_id: "c1", content: "{}" },
        ])
      )
    );
    expect(out.messages[1]).toEqual({ role: "assistant", content: "", tool_calls: [{ id: "c1" }] });
    expect(out.messages).toHaveLength(3);
  });

  it("also removes a plain reasoning field", () => {
    const out = JSON.parse(stripReasoningFromRequestBody(body([{ role: "assistant", content: "hi", reasoning: "x" }])));
    expect(out.messages[0]).toEqual({ role: "assistant", content: "hi" });
  });

  it("keeps the other request fields untouched", () => {
    const out = JSON.parse(
      stripReasoningFromRequestBody(body([{ role: "assistant", content: "a", reasoning_content: "x" }], { max_tokens: 5, tools: [1] }))
    );
    expect(out).toMatchObject({ model: "m", max_tokens: 5, tools: [1] });
  });

  it("returns the very same string when there is nothing to remove", () => {
    const input = body([{ role: "user", content: "hi" }]);
    expect(stripReasoningFromRequestBody(input)).toBe(input);
  });

  it("passes through bodies that are not chat requests", () => {
    expect(stripReasoningFromRequestBody("not json")).toBe("not json");
    expect(stripReasoningFromRequestBody('{"input":"x"}')).toBe('{"input":"x"}');
    expect(stripReasoningFromRequestBody("null")).toBe("null");
    expect(stripReasoningFromRequestBody('{"messages":"oops"}')).toBe('{"messages":"oops"}');
  });

  it("tolerates odd message entries", () => {
    const input = body([null, "text", { role: "user", content: "hi" }]);
    expect(stripReasoningFromRequestBody(input)).toBe(input);
  });
});

