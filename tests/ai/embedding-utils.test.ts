import { describe, it, expect } from "vitest";
import { buildWorkerText, hashText, toVectorLiteral } from "@/lib/ai/embedding-utils";

describe("buildWorkerText", () => {
  it("includes skills, location and bio", () => {
    const text = buildWorkerText({
      skilledIn: ["Plumber", "Electrician"],
      city: "Pune",
      state: "Maharashtra",
      bio: "  Fast and neat work  ",
      yearsExperience: 5,
    });
    expect(text).toContain("Skills: Plumber, Electrician");
    expect(text).toContain("Location: Pune, Maharashtra");
    expect(text).toContain("About: Fast and neat work");
    expect(text).toContain("Experience: 5 years");
  });

  it("flattens skills stored as a JSON string", () => {
    const text = buildWorkerText({ skilledIn: ['["plumber","painter"]'], city: "Pune" });
    expect(text).toContain("Skills: plumber, painter");
  });

  it("omits empty optional sections", () => {
    const text = buildWorkerText({ skilledIn: ["carpenter"], city: "Delhi" });
    expect(text).not.toContain("About");
    expect(text).not.toContain("Areas");
    expect(text).not.toContain("Qualification");
  });
});

describe("hashText", () => {
  it("is stable and changes with the text", () => {
    expect(hashText("a")).toBe(hashText("a"));
    expect(hashText("a")).not.toBe(hashText("b"));
  });
});

describe("toVectorLiteral", () => {
  it("formats the pgvector text form", () => {
    expect(toVectorLiteral([0.1, 0.25, -1])).toBe("[0.1,0.25,-1]");
  });
});
