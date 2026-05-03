import { describe, expect, it } from "vitest";
import { buildIssueCostSummaryForDisplay } from "./IssueDetail";
import type { RunForIssue } from "../api/activity";
import type { IssueCostSummary } from "@paperclipai/shared";

describe("IssueDetail cost summary", () => {
  it("uses the issue subtree cost summary when available", () => {
    const costSummary: IssueCostSummary = {
      issueId: "issue-root",
      issueCount: 3,
      includeDescendants: true,
      costCents: 1234,
      inputTokens: 1000,
      cachedInputTokens: 200,
      outputTokens: 300,
    };

    expect(buildIssueCostSummaryForDisplay(costSummary, [])).toEqual({
      input: 1000,
      output: 300,
      cached: 200,
      cost: 12.34,
      totalTokens: 1300,
      issueCount: 3,
      hasCost: true,
      hasTokens: true,
    });
  });

  it("falls back to linked run usage when the subtree summary is unavailable", () => {
    const linkedRuns = [
      {
        usageJson: {
          inputTokens: 100,
          outputTokens: 25,
          cachedInputTokens: 10,
          costUsd: 0.125,
        },
        resultJson: null,
      },
      {
        usageJson: null,
        resultJson: {
          cost_usd: 0.075,
        },
      },
    ] as unknown as RunForIssue[];

    expect(buildIssueCostSummaryForDisplay(undefined, linkedRuns)).toEqual({
      input: 100,
      output: 25,
      cached: 10,
      cost: 0.2,
      totalTokens: 125,
      issueCount: null,
      hasCost: true,
      hasTokens: true,
    });
  });
});
