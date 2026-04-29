import { describe, expect, it } from "vitest";
import type { Agent, Approval, Project } from "@paperclipai/shared";
import { buildStaffingHireDraft } from "./staffing-hire";

function makeAgent(overrides: Partial<Agent>): Agent {
  return {
    id: "agent-id",
    companyId: "company-id",
    name: "Agent",
    urlKey: "agent",
    role: "general",
    title: null,
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date("2026-04-23T00:00:00.000Z"),
    updatedAt: new Date("2026-04-23T00:00:00.000Z"),
    ...overrides,
  };
}

function makeApproval(overrides: Partial<Approval>): Approval {
  return {
    id: "approval-id",
    companyId: "company-id",
    type: "hire_agent",
    requestedByAgentId: null,
    requestedByUserId: "user-id",
    status: "pending",
    payload: {},
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: new Date("2026-04-23T00:00:00.000Z"),
    updatedAt: new Date("2026-04-23T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildStaffingHireDraft", () => {
  it("builds a CTO hire draft from the active CEO and strips managed instruction keys", () => {
    const project = {
      staffingState: {
        recommendedRole: "cto",
        status: "issue_created",
        baselineIssueId: null,
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "issue-2",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: null,
      },
    } satisfies Pick<Project, "staffingState">;
    const ceo = makeAgent({
      id: "agent-ceo",
      name: "CEO",
      role: "ceo",
      adapterConfig: {
        model: "gpt-5.4-mini",
        instructionsFilePath: "/tmp/ceo/AGENTS.md",
        instructionsRootPath: "/tmp/ceo",
        env: { OPENAI_API_KEY: "secret:openai" },
      },
      runtimeConfig: { reasoningEffort: "medium" },
      budgetMonthlyCents: 120000,
    });

    const draft = buildStaffingHireDraft({
      issueId: "issue-2",
      project,
      agents: [ceo],
      linkedApprovals: [],
    });

    expect(draft).not.toBeNull();
    expect(draft?.disabledReason).toBeNull();
    expect(draft?.request).toMatchObject({
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
      reportsTo: "agent-ceo",
      adapterType: "codex_local",
      runtimeConfig: { reasoningEffort: "medium" },
      budgetMonthlyCents: 120000,
      sourceIssueIds: ["issue-2"],
    });
    expect(draft?.request.adapterConfig).toEqual({
      model: "gpt-5.4-mini",
      env: { OPENAI_API_KEY: "secret:openai" },
    });
  });

  it("blocks creation when a linked hire approval already exists", () => {
    const project = {
      staffingState: {
        recommendedRole: "cto",
        status: "approval_pending",
        baselineIssueId: null,
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "issue-2",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: null,
      },
    } satisfies Pick<Project, "staffingState">;

    const draft = buildStaffingHireDraft({
      issueId: "issue-2",
      project,
      agents: [makeAgent({ id: "agent-ceo", name: "CEO", role: "ceo" })],
      linkedApprovals: [makeApproval({ status: "pending" })],
    });

    expect(draft?.disabledReason).toContain("already pending");
  });

  it("blocks creation when a CTO already exists", () => {
    const project = {
      staffingState: {
        recommendedRole: "cto",
        status: "issue_created",
        baselineIssueId: null,
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "issue-2",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: null,
      },
    } satisfies Pick<Project, "staffingState">;

    const draft = buildStaffingHireDraft({
      issueId: "issue-2",
      project,
      agents: [
        makeAgent({ id: "agent-ceo", name: "CEO", role: "ceo" }),
        makeAgent({ id: "agent-cto", name: "CTO", role: "cto" }),
      ],
      linkedApprovals: [],
    });

    expect(draft?.disabledReason).toContain("already exists");
  });
});
