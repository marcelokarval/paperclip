import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assigneeAgentId = "22222222-2222-4222-8222-222222222222";

const mockWakeup = vi.hoisted(() => vi.fn(async () => undefined));
const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));
const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  getByIdentifier: vi.fn(async () => null),
  getComment: vi.fn(),
  getCommentCursor: vi.fn(),
  getRelationSummaries: vi.fn(),
  listWakeableBlockedDependents: vi.fn(),
  getWakeableParentAfterChildCompletion: vi.fn(),
  findMentionedAgents: vi.fn(async () => []),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    canUser: vi.fn(async () => true),
    hasPermission: vi.fn(async () => true),
  }),
  activityService: () => ({
    forIssue: vi.fn(async () => []),
  }),
  agentService: () => ({
    getById: vi.fn(async () => null),
  }),
  approvalService: () => ({}),
  documentService: () => ({
    getIssueDocumentPayload: vi.fn(async () => ({})),
  }),
  executionWorkspaceService: () => ({
    getById: vi.fn(async () => null),
  }),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(async () => []),
  }),
  goalService: () => ({
    getById: vi.fn(async () => null),
    getDefaultCompanyGoal: vi.fn(async () => null),
  }),
  heartbeatService: () => ({
    wakeup: mockWakeup,
    reportRunActivity: vi.fn(async () => undefined),
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
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({
    getById: vi.fn(async () => null),
    listByIds: vi.fn(async () => []),
  }),
  routineService: () => ({
    syncRunStatusForIssue: vi.fn(async () => undefined),
  }),
  workProductService: () => ({
    listForIssue: vi.fn(async () => []),
  }),
}));

async function createApp(actor?: {
  type: "board" | "agent";
  agentId?: string;
  companyId?: string;
  userId?: string;
  companyIds?: string[];
  source?: string;
  isInstanceAdmin?: boolean;
}) {
  const [{ issueRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/issues.js")>("../routes/issues.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      ...(actor ?? {
        type: "board",
        userId: "local-board",
        companyIds: ["company-1"],
        source: "local_implicit",
        isInstanceAdmin: false,
      }),
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function makeIssue(input: {
  title: string;
  status: string;
  description?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  assigneeAdapterOverrides?: Record<string, unknown> | null;
  executionPolicy?: Record<string, unknown> | null;
}) {
  return {
    id: "issue-1",
    companyId: "company-1",
    identifier: "PAP-3700",
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: "medium",
    parentId: null,
    projectId: null,
    projectWorkspaceId: null,
    assigneeAgentId: input.assigneeAgentId ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    assigneeAdapterOverrides: input.assigneeAdapterOverrides,
    createdByAgentId: null,
    createdByUserId: "local-board",
    executionPolicy: input.executionPolicy ?? null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    labels: [],
    labelIds: [],
  };
}

describe("assigned backlog creation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.create.mockImplementation(async (_companyId: string, data: Record<string, unknown>) =>
      makeIssue({
        title: String(data.title),
        status: String(data.status),
        description: data.description as string | null | undefined,
        assigneeAgentId: data.assigneeAgentId as string | null | undefined,
        assigneeUserId: data.assigneeUserId as string | null | undefined,
        assigneeAdapterOverrides: data.assigneeAdapterOverrides as Record<string, unknown> | null | undefined,
        executionPolicy: data.executionPolicy as Record<string, unknown> | null | undefined,
      }));
    mockIssueService.getRelationSummaries.mockResolvedValue({ blockedBy: [], blocks: [] });
    mockIssueService.listWakeableBlockedDependents.mockResolvedValue([]);
    mockIssueService.getWakeableParentAfterChildCompletion.mockResolvedValue(null);
  });

  it("defaults an assigned issue with omitted status to todo", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Assigned executable work",
        assigneeAgentId,
      });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Assigned executable work",
        assigneeAgentId,
        status: "todo",
      }),
    );
    expect(res.body).toEqual(expect.objectContaining({
      assigneeAgentId,
      status: "todo",
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.created",
        details: expect.objectContaining({
          status: "todo",
          statusDefaulted: true,
          statusDefaultReason: "assigned_omitted_status",
          assignmentWakeSkipped: false,
        }),
      }),
    );
    expect(mockWakeup).toHaveBeenCalledWith(
      assigneeAgentId,
      expect.objectContaining({
        source: "assignment",
        reason: "issue_assigned",
        payload: expect.objectContaining({ mutation: "create" }),
      }),
    );
  });

  it("suppresses assignment wakeup for board-created proof issues without persisting the request flag", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Proof-only assigned work",
        assigneeAgentId,
        suppressAssignmentWakeup: true,
      });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Proof-only assigned work",
        assigneeAgentId,
        status: "todo",
      }),
    );
    expect(mockIssueService.create.mock.calls[0]?.[1]).not.toHaveProperty("suppressAssignmentWakeup");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.created",
        details: expect.objectContaining({
          status: "todo",
          statusDefaulted: true,
          statusDefaultReason: "assigned_omitted_status",
          suppressAssignmentWakeup: true,
          assignmentWakeSkipped: true,
          assignmentWakeSkipReason: "suppress_assignment_wakeup",
        }),
      }),
    );
    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("rejects agent-created issues that request assignment wakeup suppression", async () => {
    const res = await request(await createApp({
      type: "agent",
      agentId: "33333333-3333-4333-8333-333333333333",
      companyId: "company-1",
      source: "agent_api_key",
      isInstanceAdmin: false,
    }))
      .post("/api/companies/company-1/issues")
      .send({
        title: "Agent cannot suppress wakeup",
        assigneeAgentId,
        suppressAssignmentWakeup: true,
      });

    expect(res.status).toBe(403);
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("records a structured routing decision when creating an assigned issue", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Route this implementation",
        description: [
          "project_of_record: Paperclip Control Plane",
          "business_owner: CEO",
          "technical_owner: CTO",
          "workspace_of_record: /repo/paperclip",
          "execution_allowed: yes",
          "rationale: Backend routing slice",
          "confidence: high",
        ].join("\n"),
        assigneeAgentId,
        executionPolicy: {
          stages: [
            {
              type: "review",
              participants: [{ type: "user", userId: "local-board" }],
            },
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.routing_decision_recorded",
        entityType: "issue",
        entityId: "issue-1",
        details: expect.objectContaining({
          source: "issue.create",
          project_of_record: "Paperclip Control Plane",
          business_owner: "CEO",
          technical_owner: "CTO",
          workspace_of_record: "/repo/paperclip",
          execution_allowed: true,
          review_gate: "review",
          previousAssignee: null,
          selectedAssignee: { type: "agent", agentId: assigneeAgentId, userId: null },
          missingFields: [],
        }),
      }),
    );
  });

  it("does not record a routing decision for unassigned issue creation with persisted null routing fields", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Unassigned intake",
        status: "backlog",
      });

    expect(res.status).toBe(201);
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.routing_decision_recorded",
      }),
    );
  });

  it("records org-learning when creating an issue directly in a learning status", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Already blocked intake",
        status: "blocked",
      });

    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.learning_recorded",
        entityType: "issue",
        entityId: "issue-1",
        details: expect.objectContaining({
          source: "issue.create",
          status: "blocked",
          previousStatus: null,
          signals: expect.arrayContaining(["blocked_status", "missing_assignee"]),
          lessonProposal: expect.objectContaining({
            requires_hitl: true,
          }),
        }),
      }),
    );
  });

  it("preserves explicit assigned backlog as detectable parked work without assignment wakeup", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Parked assigned work",
        assigneeAgentId,
        status: "backlog",
      });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Parked assigned work",
        assigneeAgentId,
        status: "backlog",
      }),
    );
    expect(res.body).toEqual(expect.objectContaining({
      assigneeAgentId,
      status: "backlog",
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.created",
        details: expect.objectContaining({
          status: "backlog",
          statusDefaulted: false,
          statusDefaultReason: "explicit",
          assignmentWakeSkipped: true,
          assignmentWakeSkipReason: "assigned_backlog",
        }),
      }),
    );
    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("defaults an issue assigned to a user with omitted status to todo", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Assigned user work",
        assigneeUserId: "local-board",
      });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Assigned user work",
        assigneeUserId: "local-board",
        status: "todo",
      }),
    );
    expect(res.body).toEqual(expect.objectContaining({
      assigneeUserId: "local-board",
      status: "todo",
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.created",
        details: expect.objectContaining({
          status: "todo",
          statusDefaulted: true,
          statusDefaultReason: "assigned_omitted_status",
        }),
      }),
    );
    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("rejects explicit null status instead of treating it as omitted", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Invalid null status",
        assigneeAgentId,
        status: null,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockWakeup).not.toHaveBeenCalled();
  });
});
