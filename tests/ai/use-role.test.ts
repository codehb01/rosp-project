import { describe, it, expect } from "vitest";
import { parseRole } from "@/components/ai-chat/use-role";

describe("parseRole", () => {
  it("reads the role from the wrapped API response (the real shape)", () => {
    expect(parseRole({ success: true, data: { id: "1", name: "Ramesh", role: "WORKER" } })).toBe("WORKER");
    expect(parseRole({ success: true, data: { role: "CUSTOMER" } })).toBe("CUSTOMER");
  });

  it("also accepts a bare role object", () => {
    expect(parseRole({ role: "WORKER" })).toBe("WORKER");
  });

  it("returns null for accounts that are not onboarded", () => {
    expect(parseRole({ success: true, data: { role: "UNASSIGNED" } })).toBeNull();
  });

  it("returns null for missing, malformed or unexpected responses", () => {
    expect(parseRole(null)).toBeNull();
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole({})).toBeNull();
    expect(parseRole({ success: false, error: "Unauthorized" })).toBeNull();
    expect(parseRole({ data: { role: "ADMIN" } })).toBeNull();
    expect(parseRole("WORKER")).toBeNull();
  });

  it("does not mistake the old (wrong) top-level reading for the wrapped one", () => {
    // The shared useUserProfile hook reads json.role, which is undefined for the wrapped response.
    const wrapped = { success: true, data: { role: "WORKER" } } as { role?: string };
    expect(wrapped.role).toBeUndefined();
    expect(parseRole(wrapped)).toBe("WORKER");
  });
});
