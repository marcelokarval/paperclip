import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const issueId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  listAttachments: vi.fn(),
  remove: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@paperclipai/shared/telemetry", () => ({
  trackAgentTaskCompleted: vi.fn(),
  trackErrorHandlerCrash: vi.fn(),
}));

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: vi.fn(() => ({ track: vi.fn() })),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => ({
    canUser: vi.fn(async () => false),
    hasPermission: vi.fn(async () => false),
  }),
  agentService: () => ({ getById: vi.fn(async () => null), resolveByReference: vi.fn() }),
  approvalService: () => ({}),
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
    listCompanyIds: vi.fn(async () => [companyId]),
  }),
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => ({}),
  routineService: () => ({ syncRunStatusForIssue: vi.fn(async () => undefined) }),
  workProductService: () => ({}),
}));

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: issueId,
    companyId,
    status: "todo",
    priority: "medium",
    title: "Delete permission hardening",
    assigneeAgentId: null,
    assigneeUserId: "local-board",
    createdByUserId: "local-board",
    ...overrides,
  };
}

function makeAttachment() {
  return {
    id: "attachment-1",
    companyId,
    issueId,
    objectKey: "issues/delete-permission-hardening/file.txt",
  };
}

async function createApp(actor: Record<string, unknown>) {
  const [{ issueRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/issues.js"),
    import("../middleware/index.js"),
  ]);
  const storage = {
    deleteObject: vi.fn(async () => undefined),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", issueRoutes({} as any, storage as any));
  app.use(errorHandler);
  return { app, storage };
}

describe("issue delete permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.listAttachments.mockResolvedValue([makeAttachment()]);
    mockIssueService.remove.mockResolvedValue(makeIssue());
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("allows board users with company access to delete an issue and records activity", async () => {
    const { app, storage } = await createApp({
      type: "board",
      userId: "local-board",
      companyIds: [companyId],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app).delete(`/api/issues/${issueId}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockIssueService.remove).toHaveBeenCalledWith(issueId);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      companyId,
      "issues/delete-permission-hardening/file.txt",
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId,
        actorType: "user",
        actorId: "local-board",
        action: "issue.deleted",
        entityType: "issue",
        entityId: issueId,
      }),
    );
  });

  it("rejects ordinary same-company agents before deletion", async () => {
    const { app, storage } = await createApp({
      type: "agent",
      agentId,
      companyId,
      runId: "run-1",
    });

    const res = await request(app).delete(`/api/issues/${issueId}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Board access required");
    expect(mockIssueService.getById).not.toHaveBeenCalled();
    expect(mockIssueService.listAttachments).not.toHaveBeenCalled();
    expect(mockIssueService.remove).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects board users without company access before deletion", async () => {
    const { app, storage } = await createApp({
      type: "board",
      userId: "other-board",
      companyIds: ["44444444-4444-4444-8444-444444444444"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app).delete(`/api/issues/${issueId}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("User does not have access to this company");
    expect(mockIssueService.listAttachments).not.toHaveBeenCalled();
    expect(mockIssueService.remove).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated actors before deletion", async () => {
    const { app, storage } = await createApp({ type: "none" });

    const res = await request(app).delete(`/api/issues/${issueId}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Board access required");
    expect(mockIssueService.getById).not.toHaveBeenCalled();
    expect(mockIssueService.listAttachments).not.toHaveBeenCalled();
    expect(mockIssueService.remove).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects cross-company agents before deletion", async () => {
    const { app, storage } = await createApp({
      type: "agent",
      agentId,
      companyId: "44444444-4444-4444-8444-444444444444",
      runId: "run-1",
    });

    const res = await request(app).delete(`/api/issues/${issueId}`);

    expect(res.status).toBe(403);
    expect(mockIssueService.getById).not.toHaveBeenCalled();
    expect(mockIssueService.listAttachments).not.toHaveBeenCalled();
    expect(mockIssueService.remove).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
