import { describe, expect, it } from "vitest";
import { parseIssuePathIdFromPath, parseIssueReferenceFromHref } from "./issue-reference";

describe("issue-reference", () => {
  it("extracts issue ids from company-scoped issue paths", () => {
    expect(parseIssuePathIdFromPath("/PAP/issues/PAP-1271")).toBe("PAP-1271");
    expect(parseIssuePathIdFromPath("/P4Y/issues/p4y-1272")).toBe("P4Y-1272");
    expect(parseIssuePathIdFromPath("/issues/PAP-1179")).toBe("PAP-1179");
    expect(parseIssuePathIdFromPath("/issues/:id")).toBeNull();
  });

  it("does not treat full issue URLs as internal issue paths", () => {
    expect(parseIssuePathIdFromPath("http://localhost:3100/PAP/issues/PAP-1179")).toBeNull();
    expect(parseIssuePathIdFromPath("https://github.com/paperclipai/paperclip/issues/1778")).toBeNull();
  });

  it("strips unmatched trailing punctuation from issue paths", () => {
    expect(parseIssuePathIdFromPath("/issues/BBC-1)")).toBe("BBC-1");
    expect(parseIssuePathIdFromPath("/BBC/issues/BBC-1]:")).toBe("BBC-1");
  });

  it("does not treat API placeholder paths as issue references", () => {
    expect(parseIssuePathIdFromPath("/api/issues/{id}/comments")).toBeNull();
    expect(parseIssuePathIdFromPath("http://localhost:3100/api/issues/{taskId}")).toBeNull();
  });

  it("normalizes bare identifiers, relative issue paths, and issue scheme links into internal links", () => {
    expect(parseIssueReferenceFromHref("pap-1271")).toEqual({
      issuePathId: "PAP-1271",
      href: "/issues/PAP-1271",
    });
    expect(parseIssueReferenceFromHref("/P4Y/issues/p4y-1179")).toEqual({
      issuePathId: "P4Y-1179",
      href: "/issues/P4Y-1179",
    });
    expect(parseIssueReferenceFromHref("issue://PAP-1310")).toEqual({
      issuePathId: "PAP-1310",
      href: "/issues/PAP-1310",
    });
    expect(parseIssueReferenceFromHref("issue://:PAP-1311")).toEqual({
      issuePathId: "PAP-1311",
      href: "/issues/PAP-1311",
    });
  });

  it("normalizes exact inline-code-like issue identifiers", () => {
    expect(parseIssueReferenceFromHref("PAP-1271")).toEqual({
      issuePathId: "PAP-1271",
      href: "/issues/PAP-1271",
    });
  });

  it("preserves absolute Paperclip and GitHub issue URLs as external links", () => {
    expect(parseIssueReferenceFromHref("http://localhost:3100/PAP/issues/PAP-1179")).toBeNull();
    expect(parseIssueReferenceFromHref("https://github.com/paperclipai/paperclip/issues/1778")).toBeNull();
  });
});
