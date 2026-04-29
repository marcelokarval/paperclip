import { describe, expect, it } from "vitest";
import { buildRepositoryBaselineTrackingIssueDescription } from "../services/repository-baseline-tracking-issue.js";

const baseline = {
  status: "ready",
  source: "scan",
  updatedAt: "2026-04-25T15:00:00.000Z",
  summary: "Existing baseline",
  stack: ["Next.js", "TypeScript"],
  documentationFiles: ["package.json", "docs/reference/design-system.contract.md"],
  gaps: ["Package manager is ambiguous."],
  guardrails: ["Documentation only"],
  recommendationDecisions: [],
  recommendations: {
    labels: [
      {
        name: "frontend",
        color: "#2563eb",
        description: "UI behavior",
        evidence: ["React"],
        confidence: "high" as const,
      },
    ],
    issuePolicy: {
      labelUsageGuidance: [],
      parentChildGuidance: [],
      blockingGuidance: [],
      reviewGuidance: [],
      approvalGuidance: [],
    },
    projectDefaults: {
      canonicalDocs: [],
      suggestedVerificationCommands: ["pnpm -r typecheck"],
      ownershipAreas: [],
    },
  },
  analysis: {
    status: "succeeded" as const,
    summary: "Baseline is strong enough for onboarding.",
    error: null,
    rawOutput: null,
    changes: {
      appliedChanges: ["Added stack signals."],
      noOpReason: null,
    },
    risks: ["No .env.example present."],
    agentGuidance: ["Treat design-system docs as canonical."],
  },
};

describe("buildRepositoryBaselineTrackingIssueDescription", () => {
  it("renders review-completed accepted baseline snapshots as post-review support state", () => {
    const description = buildRepositoryBaselineTrackingIssueDescription({
      projectName: "launch-fullstack",
      workspaceName: "launch-fullstack",
      baseline,
      operatingContext: {
        baselineStatus: "accepted",
        executionReadiness: "unknown",
      },
      issueStatus: "in_review",
      issueAssigneeAgentId: "agent-1",
    });

    expect(description).toContain("Baseline scan status: ready");
    expect(description).toContain("Review stage: ceo_review_completed");
    expect(description).toContain("Repository context stage: repository_context_accepted");
    expect(description).toContain("Continue the repo-first workflow from Project Intake; staffing is unlocked");
  });

  it("renders assigned in-progress reviews as requested but not yet complete", () => {
    const description = buildRepositoryBaselineTrackingIssueDescription({
      projectName: "launch-fullstack",
      workspaceName: "launch-fullstack",
      baseline,
      operatingContext: null,
      issueStatus: "in_progress",
      issueAssigneeAgentId: "agent-1",
    });

    expect(description).toContain("Review stage: ceo_review_requested");
    expect(description).toContain("Repository context stage: baseline_available");
    expect(description).toContain("CEO baseline review is currently in progress");
  });
});
