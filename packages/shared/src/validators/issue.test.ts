import { describe, expect, it } from "vitest";
import { createIssueSchema } from "./issue.js";

describe("createIssueSchema assigneeAdapterOverrides", () => {
  it("accepts the cheap model profile request", () => {
    const parsed = createIssueSchema.parse({
      title: "Run cheap",
      assigneeAdapterOverrides: { modelProfile: "cheap" },
    });

    expect(parsed.assigneeAdapterOverrides?.modelProfile).toBe("cheap");
  });

  it("rejects unknown model profile requests", () => {
    expect(() =>
      createIssueSchema.parse({
        title: "Run fast",
        assigneeAdapterOverrides: { modelProfile: "fast" },
      }),
    ).toThrow();
  });
});
