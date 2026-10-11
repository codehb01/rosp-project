import { describe, it, expect } from "vitest";
import {
  buildReviewPrompt,
  hasEnoughReviews,
  parseReviewSummary,
} from "@/lib/ai/review-summary-utils";

const reviews = (n: number, withComment = n) =>
  Array.from({ length: n }, (_, i) => ({
    rating: 5,
    comment: i < withComment ? `comment ${i}` : null,
  }));

describe("hasEnoughReviews", () => {
  it("needs at least 5 reviews in total", () => {
    expect(hasEnoughReviews(4, reviews(4))).toBe(false);
    expect(hasEnoughReviews(5, reviews(5))).toBe(true);
  });

  it("needs at least 2 written comments", () => {
    expect(hasEnoughReviews(10, reviews(10, 1))).toBe(false);
    expect(hasEnoughReviews(10, reviews(10, 2))).toBe(true);
  });

  it("ignores blank comments", () => {
    const blanks = Array.from({ length: 6 }, () => ({ rating: 4, comment: "   " }));
    expect(hasEnoughReviews(6, blanks)).toBe(false);
  });
});

describe("buildReviewPrompt", () => {
  it("wraps reviews in tags with rating and comment", () => {
    const p = buildReviewPrompt([{ rating: 4, comment: "  Came on time \n and neat " }]);
    expect(p.startsWith("<reviews>")).toBe(true);
    expect(p.endsWith("</reviews>")).toBe(true);
    expect(p).toContain("1. 4/5 - Came on time and neat");
  });

  it("marks missing comments and truncates long ones", () => {
    const p = buildReviewPrompt([
      { rating: 3, comment: null },
      { rating: 5, comment: "x".repeat(1000) },
    ]);
    expect(p).toContain("(no comment)");
    expect(p).not.toContain("x".repeat(301));
  });
});

describe("parseReviewSummary", () => {
  it("parses a clean JSON reply", () => {
    expect(
      parseReviewSummary('{"summary":"Punctual and fairly priced.","tags":["punctual","fair price"]}')
    ).toEqual({ summary: "Punctual and fairly priced.", tags: ["punctual", "fair price"] });
  });

  it("extracts JSON wrapped in extra text or code fences", () => {
    const raw = 'Sure!\n```json\n{"summary":"Neat work.","tags":["neat"]}\n```';
    expect(parseReviewSummary(raw)?.summary).toBe("Neat work.");
  });

  it("returns null for malformed or non-JSON replies", () => {
    expect(parseReviewSummary("no json here")).toBeNull();
    expect(parseReviewSummary("{broken")).toBeNull();
    expect(parseReviewSummary('{"summary":"ok ok ok","tags":"nope"}')).toBeNull();
  });

  it("rejects summaries with links or phone-like numbers", () => {
    expect(parseReviewSummary('{"summary":"Visit http://evil.example now","tags":[]}')).toBeNull();
    expect(parseReviewSummary('{"summary":"Call 9876543210 for deals","tags":[]}')).toBeNull();
  });

  it("rejects empty or overlong summaries", () => {
    expect(parseReviewSummary('{"summary":"","tags":[]}')).toBeNull();
    expect(parseReviewSummary(`{"summary":"${"a".repeat(200)}","tags":[]}`)).toBeNull();
  });

  it("normalizes tags: lowercase, deduped, limited to 4, unsafe or long ones dropped", () => {
    const out = parseReviewSummary(
      JSON.stringify({
        summary: "Good worker overall.",
        tags: ["Punctual", "punctual", "Neat Work", "www.spam.com", "a".repeat(30), "polite", "cheap", "extra"],
      })
    );
    expect(out?.tags).toEqual(["punctual", "neat work", "polite", "cheap"]);
  });
});
