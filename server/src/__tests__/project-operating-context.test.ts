import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, projects, projectWorkspaces } from "@paperclipai/db";
import { projectOperatingContextSchema, projectStaffingStateSchema } from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { buildProjectOperatingContextFromBaseline, buildProjectStaffingState, projectService } from "../services/projects.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping project operating context service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describe("projectOperatingContextSchema", () => {
  it("parses a minimal valid operating context with packet defaults", () => {
    const parsed = projectOperatingContextSchema.parse({
      baselineStatus: "accepted",
      baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
      baselineTrackingIssueId: null,
      baselineTrackingIssueIdentifier: "P4Y-1",
      baselineFingerprint: "fp-123",
      overviewSummary: "Repository-first project context.",
      configurationDescriptionSuggestion: "Baseline-derived description.",
      descriptionSource: "baseline",
      labelCatalog: [
        {
          name: "frontend",
          color: "#2563eb",
          description: "UI-facing work.",
          source: "repository_baseline",
          evidence: ["React"],
          confidence: "high",
        },
      ],
      canonicalDocs: ["README.md"],
      verificationCommands: ["pnpm test"],
      ownershipAreas: [
        {
          name: "web",
          paths: ["ui/src"],
          recommendedLabels: ["frontend"],
        },
      ],
      operatingGuidance: ["Read the baseline issue first."],
      suggestedGoals: [
        {
          key: "goal-1",
          title: "Establish repo conventions",
          description: "Document the operating model.",
          reason: "Repo is pre-existing.",
          recommendedLabels: ["documentation"],
          suggestedVerificationCommands: ["pnpm test"],
          source: "repository_baseline",
          status: "pending",
          acceptedGoalId: null,
        },
      ],
      executiveProjectPacket: {
        projectSummary: "Executive summary",
        baselineTrackingIssueIdentifier: "P4Y-1",
        topRisks: ["Missing docs"],
        topGaps: ["Ownership unclear"],
        stackSummary: ["Next.js"],
        docsToReadFirst: ["README.md"],
        operatingGuidance: ["Do not create backlog automatically."],
        hiringSignals: ["cto"],
      },
      technicalProjectPacket: {
        projectSummary: "Technical summary",
        stackSignals: ["Next.js", "TypeScript"],
        canonicalDocs: ["README.md"],
        verificationCommands: ["pnpm test"],
        ownershipAreas: [
          {
            name: "web",
            paths: ["ui/src"],
            recommendedLabels: ["frontend"],
          },
        ],
        labelCatalog: [{ name: "frontend", description: "UI-facing work." }],
        issueGuidance: ["Use frontend for browser-visible changes."],
      },
    });

    expect(parsed.descriptionSource).toBe("baseline");
    expect(parsed.executionReadiness).toBe("unknown");
    expect(parsed.executiveProjectPacket?.hiringSignals).toEqual(["cto"]);
    expect(parsed.technicalProjectPacket?.labelCatalog).toEqual([
      { name: "frontend", description: "UI-facing work." },
    ]);
  });

  it("rejects invalid operating context enums and malformed IDs", () => {
    expect(() =>
      projectOperatingContextSchema.parse({
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: "not-a-uuid",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: null,
        overviewSummary: "Summary",
        configurationDescriptionSuggestion: null,
        descriptionSource: "auto",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      })
    ).toThrow();
  });
});

describe("projectStaffingStateSchema", () => {
  it("parses a minimal staffing state", () => {
    const parsed = projectStaffingStateSchema.parse({
      recommendedRole: "cto",
      status: "not_started",
      baselineIssueId: "11111111-1111-4111-8111-111111111111",
      baselineIssueIdentifier: "P4Y-1",
      hiringIssueId: null,
      hiringIssueIdentifier: null,
      lastBriefGeneratedAt: null,
    });

    expect(parsed.recommendedRole).toBe("cto");
    expect(parsed.status).toBe("not_started");
  });
});

describe("buildProjectOperatingContextFromBaseline", () => {
  it("builds a nominal operating context from accepted baseline guidance", () => {
    const operatingContext = buildProjectOperatingContextFromBaseline({
      baseline: {
        status: "ready",
        source: "scan",
        updatedAt: "2026-04-23T12:00:00.000Z",
        summary: "Existing Next.js repository.",
        stack: ["TypeScript", "Next.js"],
        documentationFiles: ["README.md", "AGENTS.md"],
        guardrails: ["Documentation only"],
        gaps: ["Ownership is not explicit."],
        recommendations: {
          labels: [],
          issuePolicy: {
            labelUsageGuidance: ["Use frontend for UI work."],
            parentChildGuidance: [],
            blockingGuidance: [],
            reviewGuidance: ["Use review for technical correctness."],
            approvalGuidance: [],
          },
          projectDefaults: {
            canonicalDocs: ["README.md"],
            suggestedVerificationCommands: ["pnpm test"],
            ownershipAreas: [
              { name: "web", paths: ["ui/src"], recommendedLabels: ["frontend"] },
            ],
          },
        },
        analysis: {
          status: "succeeded",
          provider: "codex_local",
          command: "codex",
          model: null,
          ranAt: "2026-04-23T12:00:00.000Z",
          durationMs: 500,
          summary: "Analyzer summary",
          risks: ["Missing operational docs"],
          agentGuidance: ["Read AGENTS.md first."],
          error: null,
          changes: {
            appliedChanges: ["Added canonical docs"],
            noOpReason: null,
          },
          rawOutput: null,
        },
        acceptedGuidance: null,
        recommendationDecisions: [],
        trackingIssueId: "11111111-1111-4111-8111-111111111111",
        trackingIssueIdentifier: "P4Y-1",
      },
      acceptedGuidance: {
        acceptedAt: "2026-04-23T12:05:00.000Z",
        acceptedByUserId: "user-1",
        labels: [
          {
            name: "frontend",
            color: "#2563eb",
            description: "UI work.",
            evidence: ["React"],
            confidence: "high",
          },
        ],
        issuePolicy: {
          labelUsageGuidance: ["Use frontend for UI work."],
          parentChildGuidance: ["Use parentId only for explicit decomposition."],
          blockingGuidance: ["Use blockedByIssueIds for concrete blockers."],
          reviewGuidance: ["Use review for technical correctness."],
          approvalGuidance: ["Use approval for operator decisions."],
        },
        projectDefaults: {
          canonicalDocs: ["README.md"],
          suggestedVerificationCommands: ["pnpm test"],
          ownershipAreas: [
            { name: "web", paths: ["ui/src"], recommendedLabels: ["frontend"] },
          ],
        },
      },
      issueSystemGuidance: {
        labelUsageGuidance: ["Use frontend for UI work."],
        parentChildGuidance: ["Use parentId only for explicit decomposition."],
        blockingGuidance: ["Use blockedByIssueIds for concrete blockers."],
        reviewGuidance: ["Use review for technical correctness."],
        approvalGuidance: ["Use approval for operator decisions."],
        canonicalDocs: ["README.md"],
        suggestedVerificationCommands: ["pnpm test"],
      },
      projectDescription: null,
    });

    expect(operatingContext).toMatchObject({
      baselineStatus: "accepted",
      executionReadiness: "needs_operator_contract",
      baselineTrackingIssueIdentifier: "P4Y-1",
      overviewSummary: "Existing Next.js repository.",
      descriptionSource: "none",
      canonicalDocs: ["README.md"],
      verificationCommands: ["pnpm test"],
    });
    expect(operatingContext?.suggestedGoals.length).toBeGreaterThan(0);
    expect(operatingContext?.executiveProjectPacket?.hiringSignals).toEqual(["cto"]);
    expect(operatingContext?.technicalProjectPacket?.issueGuidance).toEqual(
      expect.arrayContaining(["Use frontend for UI work."]),
    );
  });

  it("returns null without accepted guidance and stays sparse when baseline is minimal", () => {
    expect(buildProjectOperatingContextFromBaseline({
      baseline: {
        status: "ready",
        source: "scan",
        updatedAt: "2026-04-23T12:00:00.000Z",
        summary: null,
        stack: [],
        documentationFiles: [],
        guardrails: [],
      },
      acceptedGuidance: null,
      issueSystemGuidance: null,
      projectDescription: null,
    })).toBeNull();

    const operatingContext = buildProjectOperatingContextFromBaseline({
      baseline: {
        status: "ready",
        source: "scan",
        updatedAt: "2026-04-23T12:00:00.000Z",
        summary: null,
        stack: [],
        documentationFiles: [],
        guardrails: [],
        gaps: [],
      },
      acceptedGuidance: {
        acceptedAt: "2026-04-23T12:05:00.000Z",
        acceptedByUserId: "user-1",
        labels: [],
        issuePolicy: {
          labelUsageGuidance: [],
          parentChildGuidance: [],
          blockingGuidance: [],
          reviewGuidance: [],
          approvalGuidance: [],
        },
        projectDefaults: {
          canonicalDocs: [],
          suggestedVerificationCommands: [],
          ownershipAreas: [],
        },
      },
      issueSystemGuidance: null,
      projectDescription: "Manual description",
    });

    expect(operatingContext).toMatchObject({
      descriptionSource: "manual",
      labelCatalog: [],
      canonicalDocs: [],
      verificationCommands: [],
      suggestedGoals: [],
    });
    expect(operatingContext?.executiveProjectPacket?.hiringSignals).toEqual([]);
  });
});

describe("buildProjectStaffingState", () => {
  it("derives a first-role recommendation from accepted operating context", () => {
    const staffing = buildProjectStaffingState({
      operatingContext: projectOperatingContextSchema.parse({
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-123",
        overviewSummary: "Repository-first project context.",
        configurationDescriptionSuggestion: "Baseline-derived description.",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: ["pnpm test"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Missing docs"],
          topGaps: ["Ownership unclear"],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: ["Do not create backlog automatically."],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      }),
    });

    expect(staffing).toEqual({
      recommendedRole: "cto",
      status: "not_started",
      baselineIssueId: "11111111-1111-4111-8111-111111111111",
      baselineIssueIdentifier: "P4Y-1",
      hiringIssueId: null,
      hiringIssueIdentifier: null,
      lastBriefGeneratedAt: null,
    });
  });

  it("preserves a created staffing issue when one already exists", () => {
    const staffing = buildProjectStaffingState({
      operatingContext: projectOperatingContextSchema.parse({
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-123",
        overviewSummary: "Repository-first project context.",
        configurationDescriptionSuggestion: "Baseline-derived description.",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: ["pnpm test"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Missing docs"],
          topGaps: ["Ownership unclear"],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: ["Do not create backlog automatically."],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      }),
      existing: {
        recommendedRole: "cto",
        status: "issue_created",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "22222222-2222-4222-8222-222222222222",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: null,
      },
    });

    expect(staffing).toEqual({
      recommendedRole: "cto",
      status: "issue_created",
      baselineIssueId: "11111111-1111-4111-8111-111111111111",
      baselineIssueIdentifier: "P4Y-1",
      hiringIssueId: "22222222-2222-4222-8222-222222222222",
      hiringIssueIdentifier: "P4Y-2",
      lastBriefGeneratedAt: null,
    });
  });

  it("preserves approval-derived staffing states from existing server state", () => {
    const staffing = buildProjectStaffingState({
      operatingContext: projectOperatingContextSchema.parse({
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "fp-123",
        overviewSummary: "Repository-first project context.",
        configurationDescriptionSuggestion: "Baseline-derived description.",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: ["pnpm test"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Executive summary",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Missing docs"],
          topGaps: ["Ownership unclear"],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: ["Do not create backlog automatically."],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      }),
      existing: {
        recommendedRole: "cto",
        status: "approval_pending",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "22222222-2222-4222-8222-222222222222",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: "2026-04-23T12:30:00.000Z",
      },
    });

    expect(staffing?.status).toBe("approval_pending");
    expect(staffing?.hiringIssueIdentifier).toBe("P4Y-2");
  });
});

describeEmbeddedPostgres("projectService operatingContext", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof projectService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-project-operating-context-");
    db = createDb(tempDb.connectionString);
    svc = projectService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(projects);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("round-trips a valid operating context through projectService.update/getById", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Prop4You",
      issuePrefix: "P4Y",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Prop4You Fullstack",
      status: "backlog",
    });

    const operatingContext = projectOperatingContextSchema.parse({
      baselineStatus: "accepted",
      baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
      baselineTrackingIssueId: null,
      baselineTrackingIssueIdentifier: "P4Y-1",
      baselineFingerprint: "fp-123",
      overviewSummary: "Fullstack repo with baseline accepted.",
      configurationDescriptionSuggestion: "Baseline description",
      descriptionSource: "baseline",
      labelCatalog: [],
      canonicalDocs: ["README.md"],
      verificationCommands: ["pnpm test"],
      ownershipAreas: [],
      operatingGuidance: ["Review baseline before creating implementation issues."],
      suggestedGoals: [],
      executiveProjectPacket: null,
      technicalProjectPacket: null,
    });

    const updated = await svc.update(projectId, {
      operatingContext: operatingContext as unknown as Record<string, unknown>,
    });

    expect(updated?.operatingContext).toMatchObject({
      baselineStatus: "accepted",
      baselineTrackingIssueIdentifier: "P4Y-1",
      verificationCommands: ["pnpm test"],
    });

    const fetched = await svc.getById(projectId);
    expect(fetched?.operatingContext).toMatchObject({
      overviewSummary: "Fullstack repo with baseline accepted.",
      descriptionSource: "baseline",
    });
  });

  it("returns null when persisted operating context payload is invalid", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Prop4You",
      issuePrefix: "P4Y",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Invalid Project",
      status: "backlog",
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: null,
        overviewSummary: "Summary",
        configurationDescriptionSuggestion: null,
        descriptionSource: "auto",
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

    const fetched = await svc.getById(projectId);
    expect(fetched?.operatingContext).toBeNull();
  });

  it("backfills baseline tracking refs from primary workspace metadata when operatingContext is missing them", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const workspaceId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Prop4You",
      issuePrefix: "P4Y",
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Prop4You Fullstack",
      status: "backlog",
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "fp-123",
        overviewSummary: "Fullstack repo with accepted baseline.",
        configurationDescriptionSuggestion: "Baseline description",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md"],
        verificationCommands: ["pnpm test"],
        ownershipAreas: [],
        operatingGuidance: ["Read the baseline issue before implementation."],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });
    await db.insert(projectWorkspaces).values({
      id: workspaceId,
      companyId,
      projectId,
      name: "Primary workspace",
      isPrimary: true,
      metadata: {
        repositoryDocumentationBaseline: {
          status: "accepted",
          trackingIssueId: "issue-baseline-1",
          trackingIssueIdentifier: "P4Y-1",
        },
      },
    });

    const fetched = await svc.getById(projectId);
    expect(fetched?.operatingContext).toMatchObject({
      baselineTrackingIssueId: "issue-baseline-1",
      baselineTrackingIssueIdentifier: "P4Y-1",
    });
    expect(fetched?.staffingState?.baselineIssueIdentifier).toBe("P4Y-1");
  });
});
