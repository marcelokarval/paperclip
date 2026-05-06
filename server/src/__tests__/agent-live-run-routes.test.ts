import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  buildRunOutputSilence: vi.fn(),
  getRunIssueSummary: vi.fn(),
  getActiveRunIssueSummaryForAgent: vi.fn(),
  getRunLogAccess: vi.fn(),
  readLog: vi.fn(),
  wakeup: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
}));

const mockInstanceSettingsService = vi.hoisted(() => ({
  get: vi.fn(),
  getExperimental: vi.fn(),
  getGeneral: vi.fn(),
  listCompanyIds: vi.fn(),
}));

const routeAgentId = "11111111-1111-4111-8111-111111111111";

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    agentService: () => mockAgentService,
    agentInstructionsService: () => ({}),
    accessService: () => ({}),
    approvalService: () => ({}),
    companySkillService: () => ({ listRuntimeSkillEntries: vi.fn() }),
    budgetService: () => ({}),
    heartbeatService: () => mockHeartbeatService,
    issueApprovalService: () => ({}),
    issueService: () => mockIssueService,
    logActivity: vi.fn(),
    projectService: () => ({}),
    secretService: () => ({}),
    syncInstructionsBundleConfigFromFilePath: vi.fn((_agent, config) => config),
    workspaceOperationService: () => ({}),
  }));

  vi.doMock("../adapters/index.js", () => ({
    findServerAdapter: vi.fn(),
    listAdapterModelProfiles: vi.fn(async () => []),
    listAdapterModels: vi.fn(),
    detectAdapterModel: vi.fn(),
    findActiveServerAdapter: vi.fn(),
    requireServerAdapter: vi.fn(),
  }));
}

registerModuleMocks();

// These route modules are safe to cache per file because the tests reset mocks
// between examples and only exercise stateless exports.
let appModulesPromise:
  | Promise<{
      agentRoutes: typeof import("../routes/agents.js")["agentRoutes"];
      errorHandler: typeof import("../middleware/index.js")["errorHandler"];
    }>
  | null = null;

async function loadAppModules() {
  if (!appModulesPromise) {
    appModulesPromise = Promise.all([
      vi.importActual<typeof import("../routes/agents.js")>("../routes/agents.js"),
      vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    ]).then(([routes, middleware]) => ({
      agentRoutes: routes.agentRoutes,
      errorHandler: middleware.errorHandler,
    }));
  }
  return await appModulesPromise;
}

async function createApp(db: any = {}) {
  const { agentRoutes, errorHandler } = await loadAppModules();
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
  app.use("/api", agentRoutes(db));
  app.use(errorHandler);
  return app;
}

async function requestApp(
  app: express.Express,
  buildRequest: (baseUrl: string) => request.Test,
) {
  const { createServer } = await vi.importActual<typeof import("node:http")>("node:http");
  const server = createServer(app);
  try {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected HTTP server to listen on a TCP port");
    }
    return await buildRequest(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }
}

describe("agent live run routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIssueService.getByIdentifier.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      executionRunId: "run-1",
      assigneeAgentId: "agent-1",
      status: "in_progress",
    });
    mockIssueService.getById.mockResolvedValue(null);
    mockAgentService.getById.mockResolvedValue({
      id: "agent-1",
      companyId: "company-1",
      name: "Builder",
      adapterType: "codex_local",
    });
    mockHeartbeatService.getRunIssueSummary.mockResolvedValue({
      id: "run-1",
      status: "running",
      invocationSource: "on_demand",
      triggerDetail: "manual",
      startedAt: new Date("2026-04-10T09:30:00.000Z"),
      finishedAt: null,
      createdAt: new Date("2026-04-10T09:29:59.000Z"),
      agentId: "agent-1",
      issueId: "issue-1",
      contextCommentId: "comment-1",
      contextWakeCommentId: "comment-1",
    });
    mockHeartbeatService.getActiveRunIssueSummaryForAgent.mockResolvedValue(null);
    mockHeartbeatService.buildRunOutputSilence.mockResolvedValue(null);
    mockHeartbeatService.getRunLogAccess.mockResolvedValue({
      id: "run-1",
      companyId: "company-1",
      logStore: "local_file",
      logRef: "logs/run-1.ndjson",
    });
    mockHeartbeatService.readLog.mockResolvedValue({
      runId: "run-1",
      store: "local_file",
      logRef: "logs/run-1.ndjson",
      content: "chunk",
      nextOffset: 5,
    });
    mockHeartbeatService.wakeup.mockResolvedValue({
      id: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      status: "queued",
      invocationSource: "on_demand",
      triggerDetail: "manual",
    });
  });

  it("returns a compact active run payload for issue polling", async () => {
    const res = await request(await createApp()).get("/api/issues/PAP-1295/active-run");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockIssueService.getByIdentifier).toHaveBeenCalledWith("PAP-1295");
    expect(mockHeartbeatService.getRunIssueSummary).toHaveBeenCalledWith("run-1");
    expect(res.body).toEqual({
      id: "run-1",
      status: "running",
      invocationSource: "on_demand",
      triggerDetail: "manual",
      startedAt: "2026-04-10T09:30:00.000Z",
      finishedAt: null,
      createdAt: "2026-04-10T09:29:59.000Z",
      agentId: "agent-1",
      issueId: "issue-1",
      contextCommentId: "comment-1",
      contextWakeCommentId: "comment-1",
      agentName: "Builder",
      adapterType: "codex_local",
    });
    expect(res.body).not.toHaveProperty("resultJson");
    expect(res.body).not.toHaveProperty("contextSnapshot");
    expect(res.body).not.toHaveProperty("logRef");
  });

  it("ignores a stale execution run from another issue and falls back to the assignee's matching run", async () => {
    mockHeartbeatService.getRunIssueSummary.mockResolvedValue({
      id: "run-foreign",
      status: "running",
      invocationSource: "assignment",
      triggerDetail: "callback",
      startedAt: new Date("2026-04-10T10:00:00.000Z"),
      finishedAt: null,
      createdAt: new Date("2026-04-10T09:59:00.000Z"),
      agentId: "agent-1",
      issueId: "issue-2",
    });
    mockHeartbeatService.getActiveRunIssueSummaryForAgent.mockResolvedValue({
      id: "run-1",
      status: "running",
      invocationSource: "on_demand",
      triggerDetail: "manual",
      startedAt: new Date("2026-04-10T09:30:00.000Z"),
      finishedAt: null,
      createdAt: new Date("2026-04-10T09:29:59.000Z"),
      agentId: "agent-1",
      issueId: "issue-1",
    });

    const res = await request(await createApp()).get("/api/issues/PAP-1295/active-run");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockHeartbeatService.getRunIssueSummary).toHaveBeenCalledWith("run-1");
    expect(mockHeartbeatService.getActiveRunIssueSummaryForAgent).toHaveBeenCalledWith("agent-1");
    expect(res.body).toMatchObject({
      id: "run-1",
      issueId: "issue-1",
      agentId: "agent-1",
      agentName: "Builder",
      adapterType: "codex_local",
    });
  });
});

function createLiveRunRow(id: string, status = "running") {
  return {
    id,
    status,
    invocationSource: "on_demand",
    triggerDetail: "manual",
    contextCommentId: null,
    contextWakeCommentId: null,
    startedAt: new Date("2026-04-10T09:30:00.000Z"),
    finishedAt: status === "running" ? null : new Date("2026-04-10T09:35:00.000Z"),
    createdAt: new Date("2026-04-10T09:29:59.000Z"),
    agentId: "agent-1",
    agentName: "Builder",
    adapterType: "codex_local",
    issueId: "issue-1",
  };
}

function createLiveRunsDb(resultSets: Array<Array<ReturnType<typeof createLiveRunRow>>>) {
  let selectCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      const rows = resultSets[selectCount] ?? [];
      selectCount += 1;
      return {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn(async (value: number) => rows.slice(0, value)),
      };
    }),
  };
}

describe("company live run padding", () => {
  it("does not pad with recent runs when minCount is omitted", async () => {
    const liveRows = Array.from({ length: 8 }, (_entry, index) => createLiveRunRow(`run-live-${index}`));
    const db = createLiveRunsDb([liveRows]);

    const res = await request(await createApp(db)).get("/api/companies/company-1/live-runs");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("pads with recent runs when minCount is explicitly requested", async () => {
    const liveRows = Array.from({ length: 2 }, (_entry, index) => createLiveRunRow(`run-live-${index}`));
    const recentRows = Array.from({ length: 4 }, (_entry, index) => createLiveRunRow(`run-recent-${index}`, "succeeded"));
    const db = createLiveRunsDb([liveRows, recentRows]);

    const res = await request(await createApp(db)).get("/api/companies/company-1/live-runs?minCount=4");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body.map((run: { id: string }) => run.id)).toEqual([
      "run-live-0",
      "run-live-1",
      "run-recent-0",
      "run-recent-1",
    ]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("passes scoped wake fields through the legacy heartbeat invoke route", async () => {
    const res = await requestApp(
      await createApp(),
      (baseUrl) => request(baseUrl)
        .post(`/api/agents/${routeAgentId}/heartbeat/invoke?companyId=company-1`)
        .send({
          reason: "issue_assigned",
          payload: {
            issueId: "issue-1",
            taskId: "issue-1",
            taskKey: "issue-1",
          },
          forceFreshSession: true,
        }),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    // The legacy /heartbeat/invoke endpoint forwards only the wake fields the
    // caller actually supplied so empty-body callers (e.g. e2e suites) match
    // the original fixed-arg `heartbeat.invoke()` shape exactly. When the
    // caller supplies reason / payload / forceFreshSession those are
    // forwarded; idempotencyKey is omitted unless explicitly set.
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(routeAgentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "issue_assigned",
      payload: {
        issueId: "issue-1",
        taskId: "issue-1",
        taskKey: "issue-1",
      },
      requestedByActorType: "user",
      requestedByActorId: "local-board",
      contextSnapshot: {
        triggeredBy: "board",
        actorId: "local-board",
        forceFreshSession: true,
      },
    });
  });

  it("calls heartbeat.wakeup with the legacy minimal shape when the body is empty", async () => {
    const res = await requestApp(
      await createApp(),
      (baseUrl) => request(baseUrl)
        .post(`/api/agents/${routeAgentId}/heartbeat/invoke?companyId=company-1`)
        .send({}),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(routeAgentId, {
      source: "on_demand",
      triggerDetail: "manual",
      requestedByActorType: "user",
      requestedByActorId: "local-board",
      contextSnapshot: {
        triggeredBy: "board",
        actorId: "local-board",
      },
    });
  });
});
