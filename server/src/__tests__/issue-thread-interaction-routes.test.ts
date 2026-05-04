import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockCancelQuestions = vi.hoisted(() => vi.fn());
const mockListForIssue = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@paperclipai/shared/telemetry", () => ({
  trackAgentTaskCompleted: vi.fn(),
  trackErrorHandlerCrash: vi.fn(),
}));

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: vi.fn(() => ({ track: vi.fn() })),
}));

vi.mock("../services/issue-thread-interactions.js", () => ({
  issueThreadInteractionService: () => ({
    cancelQuestions: mockCancelQuestions,
    listForIssue: mockListForIssue,
  }),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => ({ getById: vi.fn(async () => null) }),
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(async () => []),
    saveIssueVote: vi.fn(async () => ({ vote: null, consentEnabledNow: false, sharingEnabled: false })),
  }),
  goalService: () => ({}),
  heartbeatService: () => ({
    getRun: vi.fn(async () => null),
    getActiveRunForAgent: vi.fn(async () => null),
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
  approvalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({ syncRunStatusForIssue: vi.fn(async () => undefined) }),
  workProductService: () => ({}),
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  return app;
}

async function installIssueRoutes(app: express.Express) {
  const [{ issueRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/issues.js"),
    import("../middleware/index.js"),
  ]);
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function boardActor() {
  return {
    type: "board",
    userId: "local-board",
    companyIds: ["company-1"],
    source: "local_implicit",
    isInstanceAdmin: false,
  };
}

function agentActor() {
  return {
    type: "agent",
    agentId: "22222222-2222-4222-8222-222222222222",
    companyId: "company-1",
  };
}

function makeIssue() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    status: "in_review",
    assigneeAgentId: null,
    assigneeUserId: "local-board",
    identifier: "PAP-4862",
    title: "Cancel question",
  };
}

function makeCancelledInteraction() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    companyId: "company-1",
    issueId: "11111111-1111-4111-8111-111111111111",
    kind: "ask_user_questions",
    status: "cancelled",
    continuationPolicy: "wake_assignee",
    payload: {
      version: 1,
      questions: [],
    },
    result: {
      version: 1,
      answers: [],
      cancelled: true,
      cancellationReason: "Not needed anymore",
      summaryMarkdown: null,
    },
    createdAt: new Date("2026-05-04T12:00:00.000Z"),
    updatedAt: new Date("2026-05-04T12:01:00.000Z"),
  };
}

describe("issue thread interaction cancel route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockAccessService.canUser.mockResolvedValue(false);
    mockAccessService.hasPermission.mockResolvedValue(false);
    mockCancelQuestions.mockResolvedValue(makeCancelledInteraction());
    mockListForIssue.mockResolvedValue([makeCancelledInteraction()]);
  });

  it("lists issue thread interactions for the issue detail UI", async () => {
    const app = await installIssueRoutes(createApp(boardActor()));
    const res = await request(app)
      .get("/api/issues/11111111-1111-4111-8111-111111111111/interactions");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      kind: "ask_user_questions",
      status: "cancelled",
    });
    expect(mockListForIssue).toHaveBeenCalledWith(expect.objectContaining({
      id: "11111111-1111-4111-8111-111111111111",
      companyId: "company-1",
    }));
  });

  it("lets board users cancel pending question interactions", async () => {
    const app = await installIssueRoutes(createApp(boardActor()));
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/cancel")
      .send({ reason: "Not needed anymore" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      status: "cancelled",
      result: {
        cancelled: true,
        cancellationReason: "Not needed anymore",
      },
    });
    expect(mockCancelQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1" }),
      "33333333-3333-4333-8333-333333333333",
      { reason: "Not needed anymore" },
      { agentId: null, userId: "local-board" },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "issue.thread_interaction_cancelled",
      details: expect.objectContaining({
        interactionId: "33333333-3333-4333-8333-333333333333",
        cancellationReason: "Not needed anymore",
      }),
    }));
  });

  it("rejects agent callers so interaction cancellation stays distinct from queued-comment cancellation", async () => {
    const app = await installIssueRoutes(createApp(agentActor()));
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/cancel")
      .send({});

    expect(res.status).toBe(403);
    expect(mockCancelQuestions).not.toHaveBeenCalled();
  });
});
