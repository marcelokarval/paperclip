import type { Agent } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import { formatActivityVerb, formatIssueActivityAction } from "./activity-format";

describe("activity formatting", () => {
  const agentMap = new Map<string, Agent>([
    ["agent-reviewer", { id: "agent-reviewer", name: "Reviewer Bot" } as Agent],
    ["agent-approver", { id: "agent-approver", name: "Approver Bot" } as Agent],
    ["agent-router", { id: "agent-router", name: "Router Bot" } as Agent],
  ]);

  it("formats blocker activity using linked issue identifiers", () => {
    const details = {
      addedBlockedByIssues: [
        { id: "issue-2", identifier: "PAP-22", title: "Blocked task" },
      ],
      removedBlockedByIssues: [],
    };

    expect(formatActivityVerb("issue.blockers_updated", details)).toBe("added blocker PAP-22 to");
    expect(formatIssueActivityAction("issue.blockers_updated", details)).toBe("added blocker PAP-22");
  });

  it("formats reviewer activity using agent names", () => {
    const details = {
      addedParticipants: [
        { type: "agent", agentId: "agent-reviewer", userId: null },
      ],
      removedParticipants: [],
    };

    expect(formatActivityVerb("issue.reviewers_updated", details, { agentMap })).toBe("added reviewer Reviewer Bot to");
    expect(formatIssueActivityAction("issue.reviewers_updated", details, { agentMap })).toBe("added reviewer Reviewer Bot");
  });

  it("formats approver removals using user-aware labels", () => {
    const details = {
      addedParticipants: [],
      removedParticipants: [
        { type: "user", agentId: null, userId: "local-board" },
      ],
    };

    expect(formatActivityVerb("issue.approvers_updated", details)).toBe("removed approver Board from");
    expect(formatIssueActivityAction("issue.approvers_updated", details)).toBe("removed approver Board");
  });

  it("falls back to updated wording when reviewers are both added and removed", () => {
    const details = {
      addedParticipants: [
        { type: "agent", agentId: "agent-reviewer", userId: null },
      ],
      removedParticipants: [
        { type: "agent", agentId: "agent-approver", userId: null },
      ],
    };

    expect(formatActivityVerb("issue.reviewers_updated", details, { agentMap })).toBe("updated reviewers on");
    expect(formatIssueActivityAction("issue.reviewers_updated", details, { agentMap })).toBe("updated reviewers");
  });

  it("formats structured routing decisions with missing fields", () => {
    const details = {
      selectedAssignee: { type: "agent", agentId: "agent-reviewer", userId: null },
      missingFields: ["business_owner", "review_gate"],
    };

    expect(formatActivityVerb("issue.routing_decision_recorded", details, { agentMap })).toBe("recorded routing decision for");
    expect(formatIssueActivityAction("issue.routing_decision_recorded", details, { agentMap })).toBe(
      "recorded routing decision to Reviewer Bot with 2 missing routing fields",
    );
  });

  it("formats routing decisions with selected user labels", () => {
    const details = {
      selectedAssignee: { type: "user", agentId: null, userId: "local-board" },
      missingFields: [],
    };

    expect(formatIssueActivityAction("issue.routing_decision_recorded", details)).toBe(
      "recorded routing decision to Board",
    );
  });

  it("formats structured org-learning records", () => {
    const details = {
      status: "blocked",
      signals: ["missing_labels", "missing_routing_fields"],
    };

    expect(formatActivityVerb("issue.learning_recorded", details)).toBe("recorded org-learning for");
    expect(formatIssueActivityAction("issue.learning_recorded", details)).toBe(
      "recorded org-learning for blocked from missing labels, missing routing fields",
    );
  });
});
