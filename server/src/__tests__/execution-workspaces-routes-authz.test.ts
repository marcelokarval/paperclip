import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  getCloseReadiness: vi.fn(),
  listForIssue: vi.fn(),
  update: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({
  createRecorder: vi.fn(),
  listForExecutionWorkspace: vi.fn(),
}));
const mockStartRuntimeServicesForWorkspaceControl = vi.hoisted(() => vi.fn());
const mockStopRuntimeServicesForExecutionWorkspace = vi.hoisted(() => vi.fn());
const mockRunWorkspaceJobForControl = vi.hoisted(() => vi.fn());
const mockEnsurePersistedExecutionWorkspaceAvailable = vi.hoisted(() => vi.fn());
const mockCleanupExecutionWorkspaceArtifacts = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  executionWorkspaceService: () => mockExecutionWorkspaceService,
  workspaceOperationService: () => mockWorkspaceOperationService,
  logActivity: mockLogActivity,
}));

vi.mock("../services/workspace-runtime.js", () => ({
  buildWorkspaceRuntimeDesiredStatePatch: vi.fn(),
  cleanupExecutionWorkspaceArtifacts: mockCleanupExecutionWorkspaceArtifacts,
  ensurePersistedExecutionWorkspaceAvailable: mockEnsurePersistedExecutionWorkspaceAvailable,
  listConfiguredRuntimeServiceEntries: vi.fn(() => []),
  runWorkspaceJobForControl: mockRunWorkspaceJobForControl,
  startRuntimeServicesForWorkspaceControl: mockStartRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForExecutionWorkspace: mockStopRuntimeServicesForExecutionWorkspace,
}));

async function createApp(actor: Record<string, unknown>) {
  const [{ executionWorkspaceRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/execution-workspaces.js")>("../routes/execution-workspaces.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", executionWorkspaceRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("execution workspace runtime controls authz", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/execution-workspaces.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.resetAllMocks();

    mockExecutionWorkspaceService.getById.mockResolvedValue({
      id: "execution-workspace-1",
      companyId: "company-1",
      cwd: "/tmp/workspace",
      config: { workspaceRuntime: { services: [{ name: "web", command: "pnpm dev" }] } },
      runtimeServices: [],
    });
  });

  it("rejects runtime service controls for agent actors", async () => {
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      source: "api_key",
    });

    const res = await request(app)
      .post("/api/execution-workspaces/execution-workspace-1/runtime-services/start")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Board access required" });
    expect(mockStartRuntimeServicesForWorkspaceControl).not.toHaveBeenCalled();
  });
});
