import { describe, expect, it } from "vitest";
import { isIssueIdentifierRef } from "./issue-identifiers.js";

describe("issue identifiers", () => {
  it("accepts configured alphanumeric prefixes", () => {
    expect(isIssueIdentifierRef("PAP-1")).toBe(true);
    expect(isIssueIdentifierRef("P4Y-1")).toBe(true);
    expect(isIssueIdentifierRef("p4y-42")).toBe(true);
  });

  it("rejects non-issue references", () => {
    expect(isIssueIdentifierRef("P4Y")).toBe(false);
    expect(isIssueIdentifierRef("4PY-1")).toBe(false);
    expect(isIssueIdentifierRef("P4Y-one")).toBe(false);
  });
});

