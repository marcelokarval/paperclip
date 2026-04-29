import { describe, expect, it } from "vitest";
import type { ProjectOperatingContext } from "@paperclipai/shared";
import {
  buildProjectPacketInstructionsBundle,
  loadDefaultAgentInstructionsBundle,
} from "../services/default-agent-instructions.js";

function makeAcceptedOperatingContext(): ProjectOperatingContext {
  return {
    baselineStatus: "accepted",
    baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
    baselineTrackingIssueId: "issue-1",
    baselineTrackingIssueIdentifier: "P4Y-1",
    baselineFingerprint: "baseline-fp",
    overviewSummary: "Existing Prop4You platform baseline accepted.",
    configurationDescriptionSuggestion: "Prop4You operating context.",
    descriptionSource: "baseline",
    labelCatalog: [],
    canonicalDocs: ["README.md"],
    verificationCommands: ["pnpm test"],
    ownershipAreas: [],
    operatingGuidance: ["Use the baseline issue as the system of record."],
    suggestedGoals: [],
    executiveProjectPacket: {
      projectSummary: "Existing Prop4You repository with accepted baseline context.",
      baselineTrackingIssueIdentifier: "P4Y-1",
      topRisks: ["Legacy auth coverage is thin."],
      topGaps: ["Architecture notes need consolidation."],
      stackSummary: ["Next.js", "TypeScript"],
      docsToReadFirst: ["README.md"],
      operatingGuidance: ["Read the baseline issue before hiring or delegating."],
      hiringSignals: ["cto"],
    },
    technicalProjectPacket: null,
  };
}

describe("buildProjectPacketInstructionsBundle", () => {
  it("ships persistent CEO guardrails in the default onboarding bundle", async () => {
    const defaultFiles = await loadDefaultAgentInstructionsBundle("ceo");

    expect(defaultFiles["AGENTS.md"]).toContain(
      "Do not refetch `/api/issues/{id}/heartbeat-context`, `/api/agents/me`, or assignment lists by raw `curl` unless the wake explicitly requires broader history or the actual mutation depends on it.",
    );
    expect(defaultFiles["HEARTBEAT.md"]).toContain(
      "When `fallbackFetchNeeded` is false, do not call `GET /api/issues/{id}/heartbeat-context`; the inline wake payload is the authoritative context for this run unless you truly need broader history.",
    );
    expect(defaultFiles["HEARTBEAT.md"]).toContain(
      "Do not use raw `curl` control-plane probes for routine confirmation when the wake payload already includes the issue state and checkout status.",
    );
  });

  it("augments the CEO default bundle with executive baseline context", async () => {
    const defaultFiles = await loadDefaultAgentInstructionsBundle("ceo");

    const result = buildProjectPacketInstructionsBundle({
      role: "ceo",
      projectName: "Prop4You Next.js Fullstack",
      operatingContext: makeAcceptedOperatingContext(),
      files: defaultFiles,
    });

    expect(result["AGENTS.md"]).toContain("PROJECT_PACKET.md");
    expect(result["AGENTS.md"]).toContain("## Baseline recovery guardrails");
    expect(result["AGENTS.md"]).toContain("Do not say work was routed to the CTO path unless you actually created the hire, issue, or reassignment in Paperclip.");
    expect(result["AGENTS.md"]).toContain("Do not claim the Paperclip control plane was unavailable unless you have direct evidence from a failed Paperclip API call in this same run.");
    expect(result["AGENTS.md"]).toContain("A failed local probe such as `curl`, `heartbeat-context`, or another shell command is not enough to conclude the Paperclip control plane was down");
    expect(result["AGENTS.md"]).toContain("Do not refetch `/api/issues/{id}/heartbeat-context`, `/api/agents/me`, or assignment lists by raw `curl` unless the wake explicitly requires broader history or the actual mutation depends on it.");
    expect(result["AGENTS.md"]).toContain("Do not say you could not update the issue thread in your final issue comment.");
    expect(result["AGENTS.md"]).toContain("accept repository context, then generate a CTO hiring brief");
    expect(result["AGENTS.md"]).toContain("treat the remaining ambiguities as CTO onboarding clarifications");
    expect(result["AGENTS.md"]).toContain("Do not require an operator freshness note, execution contract, or full runbook before the first CTO hire");
    expect(result["AGENTS.md"]).toContain("Do not phrase open clarifications as 'after that, delegation can proceed safely'");
    expect(result["PROJECT_PACKET.md"]).toContain("Project: Prop4You Next.js Fullstack");
    expect(result["PROJECT_PACKET.md"]).toContain("Baseline issue: P4Y-1");
    expect(result["PROJECT_PACKET.md"]).toContain("## Hiring signals");
    expect(result["PROJECT_PACKET.md"]).toContain("CTO");
  });

  it("adds technical onboarding guidance for CTO bundles", async () => {
    const result = buildProjectPacketInstructionsBundle({
      role: "cto",
      projectName: "Prop4You Next.js Fullstack",
      operatingContext: {
        ...makeAcceptedOperatingContext(),
        technicalProjectPacket: {
          projectSummary: "Technical onboarding packet for Prop4You.",
          stackSignals: ["Next.js", "TypeScript"],
          canonicalDocs: ["README.md"],
          verificationCommands: ["pnpm test"],
          ownershipAreas: [],
          labelCatalog: [],
          issueGuidance: ["Keep work tied to the baseline issue."],
        },
      },
      files: { "AGENTS.md": "Base CTO instructions.\n" },
    });

    expect(result["AGENTS.md"]).toContain("PROJECT_PACKET.md");
    expect(result["AGENTS.md"]).toContain("## Technical onboarding");
    expect(result["AGENTS.md"]).toContain("Convert that context into a concise technical plan");
    expect(result["AGENTS.md"]).toContain(
      "prefer your first final run response as that required technical onboarding comment",
    );
    expect(result["PROJECT_PACKET.md"]).toContain("## Verification commands");
  });
});
