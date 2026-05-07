import { describe, expect, it } from "vitest";
import { createIssueSchema, resolveCreateIssueStatusDefault } from "./issue.js";

describe("createIssueSchema assigneeAdapterOverrides", () => {
  it("keeps the public create schema composable while the route resolver handles contextual defaults", () => {
    expect(typeof createIssueSchema.extend).toBe("function");
    expect(
      resolveCreateIssueStatusDefault({
        assigneeAgentId: "22222222-2222-4222-8222-222222222222",
      }).status,
    ).toBe("todo");
    expect(createIssueSchema.parse({ title: "Unassigned work" }).status).toBe("backlog");
    expect(
      createIssueSchema.parse({
        title: "Deliberately parked",
        assigneeAgentId: "22222222-2222-4222-8222-222222222222",
        status: "backlog",
      }).status,
    ).toBe("backlog");
    expect(() =>
      createIssueSchema.parse({
        title: "Invalid explicit status",
        assigneeAgentId: "22222222-2222-4222-8222-222222222222",
        status: null,
      }),
    ).toThrow();
  });

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
