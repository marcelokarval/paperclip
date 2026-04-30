import { describe, expect, it } from "vitest";
import type { Project } from "@paperclipai/shared";
import {
  appendProjectIssueContextSnippet,
  buildKeepManualDescriptionPatch,
  buildProjectDescriptionPatch,
  buildUseBaselineDescriptionSuggestionPatch,
  getProjectIntakeModel,
  getProjectParticipantSuggestions,
  getProjectIssueContextModel,
  getProjectOverviewModel,
  getProjectStaffingModel,
} from "./project-operating-context";

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Project",
    description: null,
    status: "backlog",
    leadAgentId: null,
    targetDate: null,
    color: null,
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    issueSystemGuidance: null,
    operatingContext: null,
    staffingState: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project",
      effectiveLocalFolder: "/tmp/project",
      origin: "managed_checkout",
    },
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date("2026-04-23T12:00:00.000Z"),
    updatedAt: new Date("2026-04-23T12:00:00.000Z"),
    ...overrides,
  };
}

describe("project operating context helpers", () => {
  it("prefers operating context summary for overview", () => {
    const project = createProject({
      description: "Manual description",
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "ready",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-1",
        overviewSummary: "Baseline summary",
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Risk 1"],
          topGaps: ["Gap 1"],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
    });

    expect(getProjectOverviewModel(project)).toEqual({
      summary: "Baseline summary",
      stackSummary: ["Next.js"],
      canonicalDocs: ["README.md"],
      topRisks: ["Risk 1"],
      baselineTrackingIssueIdentifier: "P4Y-1",
      baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
    });
  });

  it("builds staffing model from server state and accepted operating context", () => {
    const project = createProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "ready",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-1",
        overviewSummary: "Baseline summary",
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Risk 1"],
          topGaps: ["Gap 1"],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
      staffingState: {
        recommendedRole: "cto",
        status: "not_started",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: null,
        hiringIssueIdentifier: null,
        lastBriefGeneratedAt: null,
      },
    });

    expect(getProjectStaffingModel(project)).toEqual({
      recommendedRole: "cto",
      recommendedRoleLabel: "CTO",
      status: "not_started",
      statusLabel: "Not started",
      baselineIssueIdentifier: "P4Y-1",
      hiringIssueIdentifier: null,
      lastBriefGeneratedAt: null,
      canGenerateBrief: true,
      blockedReason: null,
      executionReadiness: "ready",
      executionClarificationNote: null,
    });
  });

  it("surfaces an existing staffing issue in the staffing model", () => {
    const project = createProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-1",
        overviewSummary: "Baseline summary",
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: [],
          topGaps: [],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
      staffingState: {
        recommendedRole: "cto",
        status: "issue_created",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "22222222-2222-4222-8222-222222222222",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: null,
      },
    });

    expect(getProjectStaffingModel(project)).toEqual({
      recommendedRole: "cto",
      recommendedRoleLabel: "CTO",
      status: "issue_created",
      statusLabel: "Hiring issue created",
      baselineIssueIdentifier: "P4Y-1",
      hiringIssueIdentifier: "P4Y-2",
      lastBriefGeneratedAt: null,
      canGenerateBrief: false,
      blockedReason: "A hiring issue already exists for this project.",
      executionReadiness: "needs_operator_contract",
      executionClarificationNote:
        "Open execution questions will be passed into the CTO hiring brief as onboarding clarifications.",
    });
  });

  it("allows staffing brief generation after repository context acceptance even with open execution clarifications", () => {
    const project = createProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-1",
        overviewSummary: "Baseline summary",
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: [],
          topGaps: [],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
      staffingState: {
        recommendedRole: "cto",
        status: "not_started",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: null,
        hiringIssueIdentifier: null,
        lastBriefGeneratedAt: null,
      },
    });

    expect(getProjectStaffingModel(project)).toEqual({
      recommendedRole: "cto",
      recommendedRoleLabel: "CTO",
      status: "not_started",
      statusLabel: "Not started",
      baselineIssueIdentifier: "P4Y-1",
      hiringIssueIdentifier: null,
      lastBriefGeneratedAt: null,
      canGenerateBrief: true,
      blockedReason: null,
      executionReadiness: "needs_operator_contract",
      executionClarificationNote:
        "Open execution questions will be passed into the CTO hiring brief as onboarding clarifications.",
    });
  });

  it("builds description patch with manual source when user edits away from suggestion", () => {
    const project = createProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-1",
        overviewSummary: null,
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });

    expect(buildProjectDescriptionPatch(project, "Manual override")).toMatchObject({
      description: "Manual override",
      operatingContext: {
        descriptionSource: "manual",
      },
    });
  });

  it("builds description patch with baseline source when suggestion is applied", () => {
    const project = createProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-1",
        overviewSummary: null,
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "none",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });

    expect(buildUseBaselineDescriptionSuggestionPatch(project)).toMatchObject({
      description: "Suggested description",
      operatingContext: {
        descriptionSource: "baseline",
      },
    });
  });

  it("keeps manual override explicitly when requested", () => {
    const project = createProject({
      description: "Manual description",
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-1",
        overviewSummary: null,
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });

    expect(buildKeepManualDescriptionPatch(project)).toMatchObject({
      description: "Manual description",
      operatingContext: {
        descriptionSource: "manual",
      },
    });
  });

  it("merges issue guidance and operating context for issue surfaces", () => {
    const project = createProject({
      issueSystemGuidance: {
        labelUsageGuidance: ["Use frontend for browser-visible changes."],
        parentChildGuidance: ["Use sub-issues only for explicit decomposition."],
        blockingGuidance: ["Use blocked by only for concrete blockers."],
        reviewGuidance: ["Request review for risky technical changes."],
        approvalGuidance: ["Request approval before high-impact launches."],
        canonicalDocs: ["README.md"],
        suggestedVerificationCommands: ["pnpm test"],
      },
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-1",
        overviewSummary: "Baseline summary",
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [
          {
            name: "frontend",
            color: "#2563eb",
            description: "Browser-visible work.",
            source: "repository_baseline",
            evidence: ["ui/"],
            confidence: "high",
          },
        ],
        canonicalDocs: ["AGENTS.md"],
        verificationCommands: ["pnpm -r typecheck"],
        ownershipAreas: [
          {
            name: "Frontend",
            paths: ["ui/"],
            recommendedLabels: ["frontend"],
          },
        ],
        operatingGuidance: ["Read AGENTS.md before issue planning."],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });

    expect(getProjectIssueContextModel(project)).toEqual({
      labelCatalog: [
        expect.objectContaining({
          name: "frontend",
        }),
      ],
      canonicalDocs: ["README.md", "AGENTS.md"],
      verificationCommands: ["pnpm test", "pnpm -r typecheck"],
      ownershipAreas: [
        expect.objectContaining({
          name: "Frontend",
        }),
      ],
      operatingGuidance: ["Read AGENTS.md before issue planning."],
      labelUsageGuidance: ["Use frontend for browser-visible changes."],
      parentChildGuidance: ["Use sub-issues only for explicit decomposition."],
      blockingGuidance: ["Use blocked by only for concrete blockers."],
      reviewGuidance: ["Request review for risky technical changes."],
      approvalGuidance: ["Request approval before high-impact launches."],
    });
  });

  it("appends canonical docs and verification snippets once", () => {
    const context = getProjectIssueContextModel(createProject({
      issueSystemGuidance: {
        labelUsageGuidance: [],
        parentChildGuidance: [],
        blockingGuidance: [],
        reviewGuidance: [],
        approvalGuidance: [],
        canonicalDocs: ["README.md"],
        suggestedVerificationCommands: ["pnpm test"],
      },
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-1",
        overviewSummary: null,
        configurationDescriptionSuggestion: null,
        descriptionSource: "none",
        labelCatalog: [],
        canonicalDocs: ["AGENTS.md"],
        verificationCommands: ["pnpm -r typecheck"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    }));

    const withDocs = appendProjectIssueContextSnippet("", context, "docs");
    expect(withDocs).toContain("## Canonical docs");
    expect(withDocs).toContain("`README.md`");
    expect(withDocs).toContain("`AGENTS.md`");

    const withVerification = appendProjectIssueContextSnippet(withDocs, context, "verification");
    expect(withVerification).toContain("## Verification");
    expect(withVerification).toContain("`pnpm test`");
    expect(withVerification).toContain("`pnpm -r typecheck`");

    expect(appendProjectIssueContextSnippet(withVerification, context, "docs")).toBe(withVerification);
    expect(appendProjectIssueContextSnippet(withVerification, context, "verification")).toBe(withVerification);
  });

  it("suggests conservative participants from project context and existing roles", () => {
    const project = createProject({
      issueSystemGuidance: {
        labelUsageGuidance: [],
        parentChildGuidance: [],
        blockingGuidance: [],
        reviewGuidance: ["Request review before merge."],
        approvalGuidance: ["Request approval for high-impact changes."],
        canonicalDocs: [],
        suggestedVerificationCommands: ["pnpm test"],
      },
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-1",
        overviewSummary: null,
        configurationDescriptionSuggestion: null,
        descriptionSource: "none",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: ["pnpm -r typecheck"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: {
          projectSummary: "Technical packet",
          stackSignals: ["Next.js"],
          canonicalDocs: [],
          verificationCommands: ["pnpm -r typecheck"],
          ownershipAreas: [],
          labelCatalog: [],
          issueGuidance: [],
        },
      },
    });
    const agents = [
      {
        id: "agent-ceo",
        companyId: "company-1",
        name: "CEO",
        urlKey: "ceo",
        role: "ceo" as const,
        title: null,
        icon: null,
        status: "active" as const,
        reportsTo: null,
        capabilities: null,
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        budgetMonthlyCents: 0,
        spentMonthlyCents: 0,
        pauseReason: null,
        pausedAt: null,
        permissions: { canCreateAgents: true },
        lastHeartbeatAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "agent-cto",
        companyId: "company-1",
        name: "CTO",
        urlKey: "cto",
        role: "cto" as const,
        title: null,
        icon: null,
        status: "active" as const,
        reportsTo: "agent-ceo",
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "agent-qa",
        companyId: "company-1",
        name: "QA",
        urlKey: "qa",
        role: "qa" as const,
        title: null,
        icon: null,
        status: "active" as const,
        reportsTo: "agent-cto",
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    expect(getProjectParticipantSuggestions(project, agents)).toEqual({
      assigneeAgentId: "agent-cto",
      reviewerValue: "agent:agent-qa",
      approverValue: "agent:agent-ceo",
    });
  });

  it("builds a project intake model from accepted repository context", () => {
    const project = createProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-1",
        overviewSummary: "Baseline summary",
        configurationDescriptionSuggestion: "Suggested description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [
          {
            key: "goal-1",
            title: "Stabilize repo",
            description: "desc",
            reason: "reason",
            recommendedLabels: [],
            suggestedVerificationCommands: [],
            source: "repository_baseline",
            status: "pending",
            acceptedGoalId: null,
          },
        ],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: [],
          topGaps: [],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
      staffingState: {
        recommendedRole: "cto",
        status: "not_started",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: null,
        hiringIssueIdentifier: null,
        lastBriefGeneratedAt: null,
      },
      primaryWorkspace: {
        id: "workspace-1",
        projectId: "project-1",
        companyId: "company-1",
        name: "launch-fullstack",
        sourceType: "local_path",
        cwd: "/tmp/repo",
        repoUrl: null,
        repoRef: null,
        defaultRef: null,
        visibility: "default",
        isPrimary: true,
        setupCommand: null,
        cleanupCommand: null,
        remoteProvider: null,
        remoteWorkspaceRef: null,
        sharedWorkspaceKey: null,
        metadata: {
          repositoryDocumentationBaseline: {
            analysis: { status: "succeeded" },
          },
        },
        runtimeConfig: null,
        runtimeServices: [],
        createdAt: new Date("2026-04-23T12:00:00.000Z"),
        updatedAt: new Date("2026-04-23T12:00:00.000Z"),
      },
      workspaces: [],
    });

    expect(getProjectIntakeModel({
      project,
      baselineIssue: {
        status: "in_review",
        assigneeAgentId: "agent-1",
      },
      repositoryBaseline: {
        trackingIssueId: "11111111-1111-4111-8111-111111111111",
        trackingIssueIdentifier: "P4Y-1",
      },
      hasBaselineCeoReviewRequest: true,
    })).toEqual({
      currentPhase: "execution_clarifications",
      nextActionLabel: "Review optional execution clarifications or continue to staffing",
      phases: [
        {
          key: "repository_scan",
          label: "Repository scan",
          status: "completed",
          description: "A project workspace exists and baseline discovery can read repository context.",
        },
        {
          key: "ai_enrichment",
          label: "AI enrichment",
          status: "completed",
          description: "AI enrichment recorded analyzer status: succeeded.",
        },
        {
          key: "label_governance",
          label: "Label governance",
          status: "completed",
          description: "No baseline labels were suggested for this repository context.",
        },
        {
          key: "ceo_review",
          label: "CEO review",
          status: "completed",
          description: "The baseline thread already has CEO review activity.",
        },
        {
          key: "repository_acceptance",
          label: "Repository acceptance",
          status: "completed",
          description: "Repository context is accepted and available to staffing.",
        },
        {
          key: "execution_clarifications",
          label: "Execution clarifications",
          status: "in_progress",
          description: "Optional clarifications remain open and can travel into the first CTO onboarding.",
        },
        {
          key: "staffing",
          label: "Staffing",
          status: "in_progress",
          description: "Generate the CTO hiring brief once repository context is accepted.",
        },
      ],
      baselineIssueIdentifier: "P4Y-1",
      workspaceName: "launch-fullstack",
      workspaceId: "workspace-1",
      canonicalDocs: ["README.md"],
      suggestedGoalsCount: 1,
      suggestedLabelCount: 0,
      acceptedLabelCount: 0,
      staffingStatusLabel: "Not started",
    });
  });

  it("falls back to the workspace tracking issue before operating context persists the baseline link", () => {
    const project = createProject({
      operatingContext: null,
      staffingState: null,
      primaryWorkspace: {
        id: "workspace-1",
        projectId: "project-1",
        companyId: "company-1",
        name: "launch-fullstack",
        sourceType: "local_path",
        cwd: "/tmp/repo",
        repoUrl: null,
        repoRef: null,
        defaultRef: null,
        visibility: "default",
        isPrimary: true,
        setupCommand: null,
        cleanupCommand: null,
        remoteProvider: null,
        remoteWorkspaceRef: null,
        sharedWorkspaceKey: null,
        metadata: {
          repositoryDocumentationBaseline: {
            analysis: { status: "succeeded" },
          },
        },
        runtimeConfig: null,
        runtimeServices: [],
        createdAt: new Date("2026-04-23T12:00:00.000Z"),
        updatedAt: new Date("2026-04-23T12:00:00.000Z"),
      },
      workspaces: [],
    });

    expect(getProjectIntakeModel({
      project,
      repositoryBaseline: {
        trackingIssueId: "issue-1",
        trackingIssueIdentifier: "BOT-1",
      },
      baselineIssue: {
        status: "todo",
        assigneeAgentId: null,
      },
      hasBaselineCeoReviewRequest: false,
    })).toMatchObject({
      currentPhase: "ceo_review",
      nextActionLabel: "Ask CEO to review baseline from Project Intake",
      baselineIssueIdentifier: "BOT-1",
    });
  });

  it("asks the operator to create the baseline thread before CEO review when no tracking issue exists", () => {
    const project = createProject({
      operatingContext: null,
      staffingState: null,
      primaryWorkspace: {
        id: "workspace-1",
        projectId: "project-1",
        companyId: "company-1",
        name: "launch-fullstack",
        sourceType: "local_path",
        cwd: "/tmp/repo",
        repoUrl: null,
        repoRef: null,
        defaultRef: null,
        visibility: "default",
        isPrimary: true,
        setupCommand: null,
        cleanupCommand: null,
        remoteProvider: null,
        remoteWorkspaceRef: null,
        sharedWorkspaceKey: null,
        metadata: {
          repositoryDocumentationBaseline: {
            analysis: { status: "succeeded" },
          },
        },
        runtimeConfig: null,
        runtimeServices: [],
        createdAt: new Date("2026-04-23T12:00:00.000Z"),
        updatedAt: new Date("2026-04-23T12:00:00.000Z"),
      },
      workspaces: [],
    });

    expect(getProjectIntakeModel({
      project,
      repositoryBaseline: null,
      baselineIssue: null,
      hasBaselineCeoReviewRequest: false,
    })).toMatchObject({
      currentPhase: "ceo_review",
      nextActionLabel: "Create the operator issue from Project Intake",
    });
  });
});
