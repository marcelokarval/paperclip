import { describe, expect, it } from "vitest";
import { buildHeartbeatRunIssueComment } from "../services/heartbeat-run-summary.js";

describe("buildHeartbeatRunIssueComment", () => {
  it("appends a truth reconciliation footer when provided", () => {
    const comment = buildHeartbeatRunIssueComment(
      {
        summary: "Repository context is good enough for the first CTO hire.",
      },
      {
        truthReconciliationFooter: [
          "_Run truth reconciliation_",
          "- Paperclip persisted this comment for run run-1.",
        ].join("\n"),
      },
    );

    expect(comment).toContain("Repository context is good enough for the first CTO hire.");
    expect(comment).toContain("_Run truth reconciliation_");
    expect(comment).toContain("run-1");
  });

  it("normalizes repo-baseline review closeout so the first CTO is not blocked by a freshness note", () => {
    const comment = buildHeartbeatRunIssueComment(
      {
        summary: [
          "The baseline is sufficient for future technical agent work.",
          "",
          "The next single operator action is to add one operator-approved freshness note to `BBC-1` naming the canonical package manager/runtime and the required bootstrap env vars. After that, the baseline is safe for CTO onboarding and future execution.",
        ].join("\n\n"),
      },
      {
        repositoryBaselineReview: true,
        reviewFingerprint: "fp-1|repository_context_accepted",
      },
    );

    expect(comment).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(comment).toContain("Repository context is sufficient for the first CTO hire.");
    expect(comment).not.toContain("operator-approved freshness note");
    expect(comment).toContain("<!-- paperclip:baseline-ceo-review-response fingerprint=\"fp-1|repository_context_accepted\" -->");
    expect(comment).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
  });

  it("normalizes Portuguese closeout that still tries to gate the first CTO behind a freshness note", () => {
    const comment = buildHeartbeatRunIssueComment(
      {
        summary: [
          "A reanálise mantém a decisão.",
          "",
          "O baseline continua forte o bastante para onboarding técnico.",
          "",
          "A próxima ação única do operador deve ser adicionar uma freshness note em `BBC-1`. Depois disso, o baseline fica seguro para onboarding do CTO e execução futura.",
        ].join("\n\n"),
      },
      {
        repositoryBaselineReview: true,
        reviewFingerprint: "fp-pt|repository_context_accepted",
      },
    );

    expect(comment).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(comment).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
    expect(comment).not.toContain("A próxima ação única do operador deve ser adicionar uma freshness note");
  });
});
