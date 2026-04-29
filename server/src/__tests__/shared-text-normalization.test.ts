import { describe, expect, it } from "vitest";
import {
  addApprovalCommentSchema,
  addIssueCommentSchema,
  createIssueSchema,
  requestApprovalRevisionSchema,
  resolveApprovalSchema,
  updateIssueSchema,
} from "@paperclipai/shared";

describe("shared human text normalization", () => {
  it("normalizes escaped issue text fields into real newlines", () => {
    expect(
      createIssueSchema.parse({
        title: "Task",
        description: "line 1\\nline 2",
      }).description,
    ).toBe("line 1\nline 2");

    expect(updateIssueSchema.parse({ comment: "review\\r\\nrequested" }).comment).toBe(
      "review\nrequested",
    );
    expect(addIssueCommentSchema.parse({ body: "hello\\nworld" }).body).toBe("hello\nworld");
  });

  it("normalizes escaped approval text fields into real newlines", () => {
    expect(resolveApprovalSchema.parse({ decisionNote: "approved\\nship it" }).decisionNote).toBe(
      "approved\nship it",
    );
    expect(requestApprovalRevisionSchema.parse({ decisionNote: "fix\\rthis" }).decisionNote).toBe(
      "fix\nthis",
    );
    expect(addApprovalCommentSchema.parse({ body: "question\\nanswer" }).body).toBe(
      "question\nanswer",
    );
  });

  it("normalizes CRLF without rewriting unrelated backslashes", () => {
    const body = "path C:\\tmp\\file\r\nregex \\\\d+";
    expect(addIssueCommentSchema.parse({ body }).body).toBe("path C:\\tmp\\file\nregex \\\\d+");
  });

  it("does not rewrite escaped examples when substantial real multiline text is already present", () => {
    const body = "real line 1\nreal line 2\nexample literal \\n should remain";
    expect(addIssueCommentSchema.parse({ body }).body).toBe(body);
  });
});
