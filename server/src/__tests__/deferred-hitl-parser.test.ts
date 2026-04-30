import { describe, expect, it } from "vitest";
import { parseDeferredHitlApprovalRequest } from "../routes/issues.js";

describe("parseDeferredHitlApprovalRequest", () => {
  it("extracts deferred HITL proposals from an agent closeout comment", () => {
    const parsed = parseDeferredHitlApprovalRequest(`
Completed refresh.

Deferred HITL items

I did not add \`HIRING_POLICY.md\` or \`DECISION_GATES.md\`.

Proposed \`HIRING_POLICY.md\` (HITL)

\`\`\`md
# Hiring Policy
\`\`\`

Proposed \`DECISION_GATES.md\` (HITL)

\`\`\`md
# Decision Gates
\`\`\`
`);

    expect(parsed?.proposedItems).toEqual(["HIRING_POLICY.md", "DECISION_GATES.md"]);
    expect(parsed?.title).toBe("Review HITL proposals: HIRING_POLICY.md, DECISION_GATES.md");
    expect(parsed?.proposedComment).toContain("Deferred HITL items");
  });

  it("ignores comments that merely mention approval without a HITL proposal", () => {
    expect(parseDeferredHitlApprovalRequest("Verification performed. Approval was not needed.")).toBeNull();
  });
});
