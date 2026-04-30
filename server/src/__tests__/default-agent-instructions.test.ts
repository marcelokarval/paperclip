import { describe, expect, it } from "vitest";
import type { ProjectOperatingContext } from "@paperclipai/shared";
import {
  buildIssueRoutingInstructionsFile,
  buildOperatingModelsInstructionsFile,
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

    expect(defaultFiles["AGENTS.md"]).toContain("`./OPERATING_MODELS.md` is your current provider/model capability snapshot");
    expect(defaultFiles["AGENTS.md"]).toContain("Do not write general model-routing policy into the project repository");
    expect(defaultFiles["AGENTS.md"]).toContain("## Self-Improvement Governance");
    expect(defaultFiles["AGENTS.md"]).toContain("Produce a HITL proposal");
    expect(defaultFiles["AGENTS.md"]).toContain("./ORG_OPERATING_MODEL.md");
    expect(defaultFiles["AGENTS.md"]).toContain("./HIRING_POLICY.md");
    expect(defaultFiles["AGENTS.md"]).toContain("./DECISION_GATES.md");
    expect(defaultFiles["AGENTS.md"]).toContain("./WORKFLOW_PLAYBOOK.md");
    expect(defaultFiles["AGENTS.md"]).toContain("./CONTEXT_BOUNDARIES.md");
    expect(defaultFiles["AGENTS.md"]).toContain("./SELF_IMPROVEMENT.md");
    expect(defaultFiles["TOOLS.md"]).toContain("Refresh operating models");
    expect(defaultFiles["ORG_OPERATING_MODEL.md"]).toContain("CEO Scope");
    expect(defaultFiles["HIRING_POLICY.md"]).toContain("Hiring Brief Requirements");
    expect(defaultFiles["DECISION_GATES.md"]).toContain("HITL Required");
    expect(defaultFiles["WORKFLOW_PLAYBOOK.md"]).toContain("Repository Baseline To CTO");
    expect(defaultFiles["CONTEXT_BOUNDARIES.md"]).toContain("Agent-Owned Context");
    expect(defaultFiles["SELF_IMPROVEMENT.md"]).toContain("Files To Review");
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
    expect(result["AGENTS.md"]).toContain("ISSUE_ROUTING.md");
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
    expect(result["ISSUE_ROUTING.md"]).toContain("# Issue Routing");
    expect(result["ISSUE_ROUTING.md"]).toContain("Project: Prop4You Next.js Fullstack");
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
    expect(result["AGENTS.md"]).toContain("ISSUE_ROUTING.md");
    expect(result["AGENTS.md"]).toContain("## Technical onboarding");
    expect(result["AGENTS.md"]).toContain("Convert that context into a concise technical plan");
    expect(result["AGENTS.md"]).toContain(
      "prefer your first final run response as that required technical onboarding comment",
    );
    expect(result["PROJECT_PACKET.md"]).toContain("## Verification commands");
    expect(result["ISSUE_ROUTING.md"]).toContain("## Label Catalog");
  });
});

describe("buildIssueRoutingInstructionsFile", () => {
  it("renders project-derived label and verification guidance", () => {
    const result = buildIssueRoutingInstructionsFile({
      role: "cto",
      projectName: "Prop4You Next.js Fullstack",
      operatingContext: {
        ...makeAcceptedOperatingContext(),
        labelCatalog: [{
          name: "frontend",
          color: "#2563eb",
          description: "UI work.",
          source: "repository_baseline",
          evidence: ["React"],
          confidence: "high",
        }],
        ownershipAreas: [{
          name: "Frontend",
          paths: ["Next.js App Router"],
          recommendedLabels: ["frontend"],
        }],
      },
    });

    expect(result).toContain("`frontend`: UI work.");
    expect(result).toContain("Frontend: Next.js App Router");
    expect(result).toContain("Do not invent labels outside this catalog");
  });
});

describe("buildOperatingModelsInstructionsFile", () => {
  it("builds Codex-local operating policy as agent-owned instructions", () => {
    const result = buildOperatingModelsInstructionsFile({
      agentName: "CEO",
      role: "ceo",
      adapterType: "codex_local",
      auditedAt: new Date("2026-04-30T00:00:00.000Z"),
      models: [
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.4", label: "GPT-5.4" },
        { id: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
      ],
    });

    expect(result).toContain("# Operating Models");
    expect(result).toContain("Last generated: 2026-04-30T00:00:00.000Z");
    expect(result).toContain("This file is agent-owned operating knowledge");
    expect(result).toContain("gpt-5.5 discovered: yes");
    expect(result).toContain("CEO strategic technical review: prefer `gpt-5.5` with `high` reasoning");
    expect(result).toContain("Do not create project repository docs for general model-routing policy");
  });

  it("records empty discovery as a refresh-required operating snapshot", () => {
    const result = buildOperatingModelsInstructionsFile({
      agentName: "CTO",
      role: "cto",
      adapterType: "codex_local",
      auditedAt: new Date("2026-04-30T00:00:00.000Z"),
      models: [],
    });

    expect(result).toContain("No models were discovered");
    expect(result).toContain("gpt-5.5 discovered: no");
    expect(result).toContain("refresh this file before hiring");
  });
});
