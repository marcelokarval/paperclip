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

async function createApp() {
  const [{ issueRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/issues.js")>("../routes/issues.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
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
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
}) {
  return {
    id: "issue-1",
    companyId: "company-1",
    identifier: "PAP-3700",
    title: input.title,
    description: null,
    status: input.status,
    priority: "medium",
    parentId: null,
    assigneeAgentId: input.assigneeAgentId ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    createdByAgentId: null,
    createdByUserId: "local-board",
    executionWorkspaceId: null,
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
        assigneeAgentId: data.assigneeAgentId as string | null | undefined,
        assigneeUserId: data.assigneeUserId as string | null | undefined,
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
