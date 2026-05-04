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
const mockCreateInteraction = vi.hoisted(() => vi.fn());
const mockAcceptInteraction = vi.hoisted(() => vi.fn());
const mockRejectInteraction = vi.hoisted(() => vi.fn());
const mockAnswerQuestions = vi.hoisted(() => vi.fn());
const mockListForIssue = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));
const mockHeartbeatWakeup = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@paperclipai/shared/telemetry", () => ({
  trackAgentTaskCompleted: vi.fn(),
  trackErrorHandlerCrash: vi.fn(),
}));

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: vi.fn(() => ({ track: vi.fn() })),
}));

vi.mock("../services/issue-thread-interactions.js", () => ({
  issueThreadInteractionService: () => ({
    create: mockCreateInteraction,
    acceptInteraction: mockAcceptInteraction,
    rejectInteraction: mockRejectInteraction,
    answerQuestions: mockAnswerQuestions,
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
    wakeup: mockHeartbeatWakeup,
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

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    status: "in_review",
    assigneeAgentId: "44444444-4444-4444-8444-444444444444",
    assigneeUserId: null,
    identifier: "PAP-4862",
    title: "Cancel question",
    ...overrides,
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
    sourceCommentId: "55555555-5555-4555-8555-555555555555",
    sourceRunId: "66666666-6666-4666-8666-666666666666",
    createdAt: new Date("2026-05-04T12:00:00.000Z"),
    updatedAt: new Date("2026-05-04T12:01:00.000Z"),
  };
}

function makePendingQuestionInteraction() {
  return {
    ...makeCancelledInteraction(),
    status: "pending",
    result: null,
  };
}

function makeAnsweredInteraction() {
  return {
    ...makeCancelledInteraction(),
    status: "answered",
    result: {
      version: 1,
      answers: [{ questionId: "scope", optionIds: ["phase-1"] }],
      summaryMarkdown: "Phase 1.",
    },
  };
}

function makeAcceptedConfirmation() {
  return {
    ...makeCancelledInteraction(),
    kind: "request_confirmation",
    status: "accepted",
    continuationPolicy: "wake_assignee_on_accept",
    payload: {
      version: 1,
      prompt: "Approve?",
    },
    result: {
      version: 1,
      outcome: "accepted",
    },
  };
}

describe("issue thread interaction lifecycle routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockAccessService.canUser.mockResolvedValue(false);
    mockAccessService.hasPermission.mockResolvedValue(false);
    mockCreateInteraction.mockResolvedValue(makePendingQuestionInteraction());
    mockAcceptInteraction.mockResolvedValue(makeAcceptedConfirmation());
    mockRejectInteraction.mockResolvedValue({
      ...makeAcceptedConfirmation(),
      status: "rejected",
      result: { version: 1, outcome: "rejected", reason: "No" },
    });
    mockAnswerQuestions.mockResolvedValue(makeAnsweredInteraction());
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

  it("lets board users create interactions", async () => {
    const app = await installIssueRoutes(createApp(boardActor()));
    const payload = {
      kind: "ask_user_questions",
      idempotencyKey: "ask-scope",
      payload: {
        version: 1,
        questions: [{
          id: "scope",
          prompt: "Choose scope",
          selectionMode: "single",
          options: [{ id: "phase-1", label: "Phase 1" }],
        }],
      },
    };
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions")
      .send(payload);

    expect(res.status).toBe(201);
    expect(mockCreateInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1" }),
      expect.objectContaining(payload),
      { agentId: null, userId: "local-board" },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "issue.thread_interaction_created",
      details: expect.objectContaining({
        interactionKind: "ask_user_questions",
        interactionStatus: "pending",
      }),
    }));
  });

  it("lets board users answer ask_user_questions interactions and wakes the assignee", async () => {
    const app = await installIssueRoutes(createApp(boardActor()));
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/respond")
      .send({
        answers: [{ questionId: "scope", optionIds: ["phase-1"] }],
        summaryMarkdown: "Phase 1.",
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "answered",
      result: {
        answers: [{ questionId: "scope", optionIds: ["phase-1"] }],
      },
    });
    expect(mockAnswerQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1" }),
      "33333333-3333-4333-8333-333333333333",
      {
        answers: [{ questionId: "scope", optionIds: ["phase-1"] }],
        summaryMarkdown: "Phase 1.",
      },
      { agentId: null, userId: "local-board" },
    );
    expect(mockHeartbeatWakeup).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      expect.objectContaining({
        payload: expect.objectContaining({
          interactionStatus: "answered",
          mutation: "interaction",
        }),
        contextSnapshot: expect.objectContaining({
          source: "issue.interaction.respond",
          interactionStatus: "answered",
        }),
      }),
    );
  });

  it("lets board users accept and reject supported interactions", async () => {
    const app = await installIssueRoutes(createApp(boardActor()));
    const accepted = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/accept")
      .send({});

    expect(accepted.status).toBe(200);
    expect(mockAcceptInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1" }),
      "33333333-3333-4333-8333-333333333333",
      {},
      { agentId: null, userId: "local-board" },
    );

    const rejected = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/reject")
      .send({ reason: "No" });

    expect(rejected.status).toBe(200);
    expect(mockRejectInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111", companyId: "company-1" }),
      "33333333-3333-4333-8333-333333333333",
      { reason: "No" },
      { agentId: null, userId: "local-board" },
    );
  });

  it("does not expose selected task acceptance through the accept route contract", async () => {
    const app = await installIssueRoutes(createApp(boardActor()));
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/accept")
      .send({ selectedClientKeys: ["task-1"] });

    expect(res.status).toBe(400);
    expect(mockAcceptInteraction).not.toHaveBeenCalled();
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
    expect(mockHeartbeatWakeup).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      expect.objectContaining({
        source: "automation",
        triggerDetail: "system",
        reason: "issue_commented",
        payload: expect.objectContaining({
          issueId: "11111111-1111-4111-8111-111111111111",
          interactionId: "33333333-3333-4333-8333-333333333333",
          interactionKind: "ask_user_questions",
          interactionStatus: "cancelled",
          sourceCommentId: "55555555-5555-4555-8555-555555555555",
          sourceRunId: "66666666-6666-4666-8666-666666666666",
          mutation: "interaction",
        }),
        contextSnapshot: expect.objectContaining({
          issueId: "11111111-1111-4111-8111-111111111111",
          taskId: "11111111-1111-4111-8111-111111111111",
          interactionId: "33333333-3333-4333-8333-333333333333",
          interactionStatus: "cancelled",
          source: "issue.interaction.cancel",
        }),
      }),
    );
  });

  it("does not wake continuation when cancelled interaction uses accept-only continuation", async () => {
    mockCancelQuestions.mockResolvedValue({
      ...makeCancelledInteraction(),
      continuationPolicy: "wake_assignee_on_accept",
    });
    const app = await installIssueRoutes(createApp(boardActor()));
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/cancel")
      .send({});

    expect(res.status).toBe(200);
    expect(mockHeartbeatWakeup).not.toHaveBeenCalled();
  });

  it("does not wake continuation when cancellation has no agent assignee", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({
      assigneeAgentId: null,
      assigneeUserId: "local-board",
    }));
    const app = await installIssueRoutes(createApp(boardActor()));
    const res = await request(app)
      .post("/api/issues/11111111-1111-4111-8111-111111111111/interactions/33333333-3333-4333-8333-333333333333/cancel")
      .send({});

    expect(res.status).toBe(200);
    expect(mockHeartbeatWakeup).not.toHaveBeenCalled();
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
