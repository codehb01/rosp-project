import { describe, it, expect } from "vitest";
import { bookingDraftSchema, checkDraftDate } from "@/lib/ai/booking-draft";

const valid = {
  workerId: "w1",
  description: "Fix leaking tap",
  datetime: "2030-01-01T10:00:00+05:30",
  location: "Kothrud, Pune",
  charge: 500,
};

describe("bookingDraftSchema", () => {
  it("accepts a complete draft", () => {
    expect(bookingDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a zero or negative charge", () => {
    expect(bookingDraftSchema.safeParse({ ...valid, charge: 0 }).success).toBe(false);
    expect(bookingDraftSchema.safeParse({ ...valid, charge: -5 }).success).toBe(false);
  });

  it("rejects a missing worker, short description or location", () => {
    expect(bookingDraftSchema.safeParse({ ...valid, workerId: "" }).success).toBe(false);
    expect(bookingDraftSchema.safeParse({ ...valid, description: "ab" }).success).toBe(false);
    expect(bookingDraftSchema.safeParse({ ...valid, location: "x" }).success).toBe(false);
  });
});

describe("checkDraftDate", () => {
  const now = new Date("2030-01-01T00:00:00Z");

  it("accepts a future date and normalizes to ISO", () => {
    const r = checkDraftDate("2030-01-02T10:00:00+05:30", now);
    expect(r).toEqual({ ok: true, datetime: "2030-01-02T04:30:00.000Z" });
  });

  it("rejects a past date", () => {
    expect(checkDraftDate("2029-12-31T10:00:00Z", now).ok).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(checkDraftDate("tomorrow", now).ok).toBe(false);
  });
});
