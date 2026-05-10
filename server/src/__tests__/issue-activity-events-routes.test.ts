import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeIssueExecutionPolicy } from "../services/issue-execution-policy.ts";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  assertCheckoutOwner: vi.fn(),
  update: vi.fn(),
  addComment: vi.fn(),
  findMentionedAgents: vi.fn(),
  getRelationSummaries: vi.fn(),
  listWakeableBlockedDependents: vi.fn(),
  getWakeableParentAfterChildCompletion: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));
const mockActivityService = vi.hoisted(() => ({
  forIssue: vi.fn(),
}));
const mockIssueApprovalService = vi.hoisted(() => ({
  listApprovalsForIssue: vi.fn(),
  link: vi.fn(),
}));
const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    canUser: vi.fn(async () => false),
    hasPermission: vi.fn(async () => false),
  }),
  agentService: () => ({
    getById: vi.fn(async () => null),
    resolveByReference: vi.fn(async (_companyId: string, raw: string) => ({
      ambiguous: false,
      agent: { id: raw },
    })),
  }),
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(async () => []),
    saveIssueVote: vi.fn(async () => ({ vote: null, consentEnabledNow: false, sharingEnabled: false })),
  }),
  goalService: () => ({}),
  heartbeatService: () => ({
    wakeup: vi.fn(async () => undefined),
    reportRunActivity: vi.fn(async () => undefined),
    getRun: vi.fn(async () => null),
    getActiveRunForAgent: vi.fn(async () => null),
    cancelRun: vi.fn(async () => null),
  }),
  instanceSettingsService: () => ({
    get: vi.fn(async () => ({
      id: "instance-settings-1",
      general: {
        censorUsernameInLogs: false,
        feedbackDataSharingPreference: "prompt",
      },
    })),
    listCompanyIds: vi.fn(async () => ["company-1"]),
  }),
  activityService: () => mockActivityService,
  issueApprovalService: () => mockIssueApprovalService,
  approvalService: () => mockApprovalService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({}),
}));

async function createApp(actor: Record<string, unknown> = {
  type: "board",
  userId: "local-board",
  companyIds: ["company-1"],
  source: "local_implicit",
  isInstanceAdmin: false,
}) {
  const [{ issueRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/issues.js")>("../routes/issues.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function makeIssue() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    status: "todo",
    assigneeAgentId: "22222222-2222-4222-8222-222222222222",
    assigneeUserId: null,
    createdByUserId: "local-board",
    identifier: "PAP-580",
    title: "Activity event issue",
    executionPolicy: null,
    executionState: null,
  };
}

describe("issue activity event routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/issues.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.resetAllMocks();
    mockIssueService.assertCheckoutOwner.mockResolvedValue({ adoptedFromRunId: null });
    mockIssueService.list.mockResolvedValue([]);
    mockIssueService.create.mockResolvedValue({
      ...makeIssue(),
      id: "33333333-3333-4333-8333-333333333333",
      identifier: "PAP-581",
      title: "Apply approved org-learning from PAP-580",
      parentId: "11111111-1111-4111-8111-111111111111",
      originKind: "org_learning_apply",
    });
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
    mockIssueService.getRelationSummaries.mockResolvedValue({ blockedBy: [], blocks: [] });
    mockIssueService.listWakeableBlockedDependents.mockResolvedValue([]);
    mockIssueService.getWakeableParentAfterChildCompletion.mockResolvedValue(null);
    mockActivityService.forIssue.mockResolvedValue([]);
    mockIssueApprovalService.listApprovalsForIssue.mockResolvedValue([]);
    mockIssueApprovalService.link.mockResolvedValue(undefined);
    mockApprovalService.create.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      companyId: "company-1",
      type: "request_board_approval",
      status: "pending",
      requestedByAgentId: null,
      requestedByUserId: "local-board",
      payload: {},
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("logs blocker activity with added and removed issue summaries", async () => {
    const issue = makeIssue();
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.getRelationSummaries
      .mockResolvedValueOnce({
        blockedBy: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            identifier: "PAP-10",
            title: "Old blocker",
            status: "todo",
            priority: "medium",
            assigneeAgentId: null,
            assigneeUserId: null,
          },
        ],
        blocks: [],
      })
      .mockResolvedValueOnce({
        blockedBy: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            identifier: "PAP-11",
            title: "New blocker",
            status: "todo",
            priority: "medium",
            assigneeAgentId: null,
            assigneeUserId: null,
          },
        ],
        blocks: [],
      });
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...issue,
      ...patch,
      updatedAt: new Date(),
    }));

    const res = await request(await createApp())
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ blockedByIssueIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.blockers_updated",
          details: expect.objectContaining({
            addedBlockedByIssueIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
            removedBlockedByIssueIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
            addedBlockedByIssues: [
              {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                identifier: "PAP-11",
                title: "New blocker",
              },
            ],
            removedBlockedByIssues: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                identifier: "PAP-10",
                title: "Old blocker",
              },
            ],
          }),
        }),
      );
    });
  }, 15_000);

  it("logs explicit reviewer and approver activity when execution policy participants change", async () => {
    const existingPolicy = normalizeIssueExecutionPolicy({
      stages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "review",
          participants: [{ type: "agent", agentId: "11111111-2222-4333-8444-555555555555" }],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          type: "approval",
          participants: [{ type: "agent", agentId: "66666666-7777-4888-8999-aaaaaaaaaaaa" }],
        },
      ],
    })!;
    const nextPolicy = normalizeIssueExecutionPolicy({
      stages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "review",
          participants: [{ type: "agent", agentId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" }],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          type: "approval",
          participants: [{ type: "user", userId: "local-board" }],
        },
      ],
    })!;
    const issue = {
      ...makeIssue(),
      executionPolicy: existingPolicy,
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...issue,
      ...patch,
      executionPolicy: patch.executionPolicy,
      updatedAt: new Date(),
    }));

    const res = await request(await createApp())
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ executionPolicy: nextPolicy });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.reviewers_updated",
          details: expect.objectContaining({
            participants: [{ type: "agent", agentId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", userId: null }],
            addedParticipants: [{ type: "agent", agentId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff", userId: null }],
            removedParticipants: [{ type: "agent", agentId: "11111111-2222-4333-8444-555555555555", userId: null }],
          }),
        }),
      );
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.approvers_updated",
          details: expect.objectContaining({
            participants: [{ type: "user", agentId: null, userId: "local-board" }],
            addedParticipants: [{ type: "user", agentId: null, userId: "local-board" }],
            removedParticipants: [{ type: "agent", agentId: "66666666-7777-4888-8999-aaaaaaaaaaaa", userId: null }],
          }),
        }),
      );
    });
  });

  it("records org-learning activity when an issue transitions to blocked", async () => {
    const issue = {
      ...makeIssue(),
      status: "todo",
      labels: [],
      projectId: null,
      goalId: null,
      parentId: null,
      description: "technical_owner: CTO",
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...issue,
      ...patch,
      updatedAt: new Date(),
    }));

    const res = await request(await createApp())
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "blocked" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.learning_recorded",
          entityType: "issue",
          entityId: issue.id,
          details: expect.objectContaining({
            source: "issue.status_transition",
            previousStatus: "todo",
            status: "blocked",
            signals: expect.arrayContaining([
              "blocked_status",
              "missing_labels",
              "missing_project",
              "missing_routing_fields",
              "status_transition",
            ]),
            missingFields: expect.arrayContaining([
              "project_of_record",
              "business_owner",
              "workspace_of_record",
              "execution_allowed",
              "review_gate",
            ]),
            lessonProposal: expect.objectContaining({
              requires_hitl: true,
            }),
          }),
        }),
      );
    });
  });

  it("records a structured routing decision when an issue is reassigned", async () => {
    const issue = {
      ...makeIssue(),
      status: "todo",
      assigneeAgentId: null,
      assigneeUserId: "local-board",
      description: [
        "project_of_record: Paperclip",
        "business_owner: CEO",
        "technical_owner: CTO",
        "workspace_of_record: /repo/paperclip",
        "execution_allowed: no",
        "review_gate: CTO review",
      ].join("\n"),
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...issue,
      ...patch,
      updatedAt: new Date(),
    }));

    const nextAgentId = "33333333-3333-4333-8333-333333333333";
    const res = await request(await createApp())
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ assigneeAgentId: nextAgentId, assigneeUserId: null });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.routing_decision_recorded",
          entityType: "issue",
          entityId: issue.id,
          details: expect.objectContaining({
            source: "issue.update",
            previousAssignee: { type: "user", agentId: null, userId: "local-board" },
            selectedAssignee: { type: "agent", agentId: nextAgentId, userId: null },
            project_of_record: "Paperclip",
            business_owner: "CEO",
            technical_owner: "CTO",
            workspace_of_record: "/repo/paperclip",
            execution_allowed: false,
            review_gate: "CTO review",
            missingFields: [],
          }),
        }),
      );
    });
  });

  it("records a routing decision when only assignee adapter overrides change", async () => {
    const issue = {
      ...makeIssue(),
      status: "todo",
      assigneeAgentId: "22222222-2222-4222-8222-222222222222",
      assigneeUserId: null,
      assigneeAdapterOverrides: null,
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...issue,
      ...patch,
      updatedAt: new Date(),
    }));

    const res = await request(await createApp())
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ assigneeAdapterOverrides: { modelProfile: "cheap" } });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "issue.routing_decision_recorded",
          details: expect.objectContaining({
            source: "issue.update",
            previousAssignee: { type: "agent", agentId: "22222222-2222-4222-8222-222222222222", userId: null },
            selectedAssignee: { type: "agent", agentId: "22222222-2222-4222-8222-222222222222", userId: null },
            assigneeMetadata: { modelProfile: "cheap" },
          }),
        }),
      );
    });
  });

  it("projects issue org-intelligence records from activity", async () => {
    const issue = makeIssue();
    mockIssueService.getById.mockResolvedValue(issue);
    mockActivityService.forIssue.mockResolvedValue([
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        companyId: "company-1",
        actorType: "user",
        actorId: "local-board",
        agentId: null,
        runId: null,
        action: "issue.routing_decision_recorded",
        entityType: "issue",
        entityId: issue.id,
        details: {
          source: "issue.create",
          previousAssignee: { type: "user", userId: "local-board" },
          selectedAssignee: { type: "agent", agentId: "22222222-2222-4222-8222-222222222222" },
          project_of_record: "Paperclip",
          execution_allowed: false,
          missingFields: [],
        },
        createdAt: new Date("2026-05-07T00:01:00.000Z"),
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        companyId: "company-1",
        actorType: "system",
        actorId: "system",
        agentId: null,
        runId: null,
        action: "issue.learning_recorded",
        entityType: "issue",
        entityId: issue.id,
        details: {
          source: "issue.status_transition",
          status: "blocked",
          previousStatus: "todo",
          signals: ["blocked_status"],
          missingFields: ["project_of_record"],
          suggestedInstructionSurfaces: ["LESSONS_LEDGER.md"],
          lessonProposal: {
            proposed_change: "Update routing handoff guidance.",
          },
        },
        createdAt: new Date("2026-05-07T00:00:00.000Z"),
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        companyId: "company-1",
        actorType: "user",
        actorId: "local-board",
        agentId: null,
        runId: null,
        action: "issue.org_learning_apply_approved",
        entityType: "issue",
        entityId: issue.id,
        details: {
          approvalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          learningActivityEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          suggestedInstructionSurfaces: ["LESSONS_LEDGER.md"],
          signals: ["blocked_status"],
          nextActionOnApproval: "Update agent guidance.",
          proposedComment: "Apply this lesson.",
        },
        createdAt: new Date("2026-05-07T00:02:00.000Z"),
      },
    ]);

    const res = await request(await createApp())
      .get("/api/issues/11111111-1111-4111-8111-111111111111/org-intelligence");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        kind: "routing",
        selectedAssignee: expect.objectContaining({
          id: "22222222-2222-4222-8222-222222222222",
        }),
        executionAllowed: "no",
      }),
      expect.objectContaining({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "learning",
        status: "blocked",
        previousStatus: "todo",
        signals: ["blocked_status"],
        suggestedInstructionSurfaces: ["LESSONS_LEDGER.md"],
        lessonProposal: {
          proposed_change: "Update routing handoff guidance.",
        },
      }),
      expect.objectContaining({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "learning_apply_approved",
        approvalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        learningActivityEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        suggestedInstructionSurfaces: ["LESSONS_LEDGER.md"],
        signals: ["blocked_status"],
        nextActionOnApproval: "Update agent guidance.",
        proposedComment: "Apply this lesson.",
      }),
    ]);
  });

  it("creates a HITL approval from a recorded org-learning proposal", async () => {
    const issue = makeIssue();
    mockIssueService.getById.mockResolvedValue(issue);
    mockActivityService.forIssue.mockResolvedValue([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        companyId: "company-1",
        actorType: "system",
        actorId: "system",
        agentId: null,
        runId: null,
        action: "issue.learning_recorded",
        entityType: "issue",
        entityId: issue.id,
        details: {
          source: "issue.status_transition",
          status: "blocked",
          signals: ["blocked_status"],
          missingFields: ["project_of_record"],
          suggestedInstructionSurfaces: ["LESSONS_LEDGER.md"],
          lessonProposal: {
            observed_problem: "Issue blocked without routing owner.",
            proposed_instruction_surface: "ROUTING_TABLE.md",
            proposed_change: "Require routing owner before execution.",
          },
        },
        createdAt: new Date("2026-05-07T00:00:00.000Z"),
      },
    ]);

    const res = await request(await createApp())
      .post("/api/issues/11111111-1111-4111-8111-111111111111/org-learning-approval")
      .send({ activityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });

    expect(res.status).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        type: "request_board_approval",
        requestedByUserId: "local-board",
        payload: expect.objectContaining({
          source: "org_learning_proposal",
          learningActivityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          recommendedAction: expect.stringContaining("Approve only if"),
          proposedItems: expect.arrayContaining([
            "Require routing owner before execution.",
            "Review ROUTING_TABLE.md",
          ]),
        }),
      }),
    );
    expect(mockIssueApprovalService.link).toHaveBeenCalledWith(
      issue.id,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { agentId: null, userId: "local-board" },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.approval_linked",
        entityType: "issue",
        entityId: issue.id,
        details: expect.objectContaining({
          source: "org_learning_proposal",
          learningActivityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      }),
    );
  });

  it("creates an idempotent apply issue from approved org-learning", async () => {
    const issue = {
      ...makeIssue(),
      projectId: "44444444-4444-4444-8444-444444444444",
      projectWorkspaceId: "55555555-5555-4555-8555-555555555555",
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockActivityService.forIssue.mockResolvedValue([
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        companyId: "company-1",
        actorType: "user",
        actorId: "local-board",
        agentId: null,
        runId: null,
        action: "issue.org_learning_apply_approved",
        entityType: "issue",
        entityId: issue.id,
        details: {
          approvalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          learningActivityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          suggestedInstructionSurfaces: ["LESSONS_LEDGER.md"],
          signals: ["blocked_status"],
          nextActionOnApproval: "Update agent guidance.",
          proposedComment: "Apply this lesson.",
        },
        createdAt: new Date("2026-05-07T00:02:00.000Z"),
      },
    ]);

    const res = await request(await createApp())
      .post("/api/issues/11111111-1111-4111-8111-111111111111/org-learning-apply-issue")
      .send({ activityEventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", suppressAssignmentWakeup: true });

    expect(res.status).toBe(201);
    expect(mockIssueService.list).toHaveBeenCalledWith("company-1", expect.objectContaining({
      originKind: "org_learning_apply",
      originId: "org-learning-apply:11111111-1111-4111-8111-111111111111:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }));
    expect(mockIssueService.create).toHaveBeenCalledWith("company-1", expect.objectContaining({
      title: "Apply approved org-learning from PAP-580",
      status: "backlog",
      parentId: issue.id,
      assigneeAgentId: "22222222-2222-4222-8222-222222222222",
      projectId: "44444444-4444-4444-8444-444444444444",
      projectWorkspaceId: "55555555-5555-4555-8555-555555555555",
      originKind: "org_learning_apply",
      originId: "org-learning-apply:11111111-1111-4111-8111-111111111111:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      description: expect.stringContaining("Do not mutate instruction files silently."),
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.org_learning_apply_issue_created",
        entityId: issue.id,
        details: expect.objectContaining({
          approvalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          learningActivityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          followUpIssueId: "33333333-3333-4333-8333-333333333333",
          suppressAssignmentWakeup: true,
        }),
      }),
    );
  });

  it("returns an existing org-learning apply issue for the same source approval and learning event", async () => {
    const issue = makeIssue();
    const existing = {
      ...makeIssue(),
      id: "33333333-3333-4333-8333-333333333333",
      identifier: "PAP-581",
      title: "Apply approved org-learning from PAP-580",
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.list.mockResolvedValue([existing]);
    mockActivityService.forIssue.mockResolvedValue([
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        companyId: "company-1",
        actorType: "user",
        actorId: "local-board",
        agentId: null,
        runId: null,
        action: "issue.org_learning_apply_approved",
        entityType: "issue",
        entityId: issue.id,
        details: {
          approvalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          learningActivityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
        createdAt: new Date("2026-05-07T00:02:00.000Z"),
      },
    ]);

    const res = await request(await createApp())
      .post("/api/issues/11111111-1111-4111-8111-111111111111/org-learning-apply-issue")
      .send({ activityEventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe("duplicate_org_learning_apply_issue");
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("returns the concurrent org-learning apply issue when unique insert races", async () => {
    const issue = makeIssue();
    const existing = {
      ...makeIssue(),
      id: "33333333-3333-4333-8333-333333333333",
      identifier: "PAP-581",
      title: "Apply approved org-learning from PAP-580",
    };
    mockIssueService.getById.mockResolvedValue(issue);
    mockIssueService.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing]);
    mockIssueService.create.mockRejectedValueOnce({
      code: "23505",
      constraint: "issues_org_learning_apply_origin_uq",
    });
    mockActivityService.forIssue.mockResolvedValue([
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        companyId: "company-1",
        actorType: "user",
        actorId: "local-board",
        agentId: null,
        runId: null,
        action: "issue.org_learning_apply_approved",
        entityType: "issue",
        entityId: issue.id,
        details: {
          approvalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          learningActivityEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
        createdAt: new Date("2026-05-07T00:02:00.000Z"),
      },
    ]);

    const res = await request(await createApp())
      .post("/api/issues/11111111-1111-4111-8111-111111111111/org-learning-apply-issue")
      .send({ activityEventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe("duplicate_org_learning_apply_issue");
    expect(res.body.issue.id).toBe(existing.id);
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.org_learning_apply_issue_created" }),
    );
  });

  it("rejects agent access when creating an org-learning apply issue", async () => {
    const res = await request(await createApp({
      type: "agent",
      agentId: "22222222-2222-4222-8222-222222222222",
      companyId: "company-1",
      runId: null,
    }))
      .post("/api/issues/11111111-1111-4111-8111-111111111111/org-learning-apply-issue")
      .send({ activityEventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });

    expect(res.status).toBe(403);
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });
});
