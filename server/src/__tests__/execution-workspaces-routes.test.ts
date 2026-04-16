import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({
  createRecorder: vi.fn(() => ({
    recordOperation: vi.fn(),
  })),
  listForExecutionWorkspace: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  executionWorkspaceService: () => mockExecutionWorkspaceService,
  workspaceOperationService: () => mockWorkspaceOperationService,
  logActivity: mockLogActivity,
}));

function buildExistingWorkspace() {
  return {
    id: "workspace-1",
    companyId: "company-1",
    status: "active",
    mode: "task_session",
    strategyType: "issue_branch",
    metadata: { source: "task_session" },
    config: null,
    runtimeServices: [],
    cwd: "/tmp/workspace-1",
    projectId: null,
    projectWorkspaceId: null,
    repoUrl: null,
    baseRef: null,
    branchName: null,
    providerRef: null,
    sourceIssueId: null,
    name: "Workspace 1",
  };
}

async function createApp(actor: any) {
  const [{ errorHandler }, { executionWorkspaceRoutes }] = await Promise.all([
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    vi.importActual<typeof import("../routes/execution-workspaces.js")>("../routes/execution-workspaces.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", executionWorkspaceRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("execution workspace routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/execution-workspaces.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.resetAllMocks();

    mockExecutionWorkspaceService.getById.mockResolvedValue(buildExistingWorkspace());
    mockExecutionWorkspaceService.update.mockImplementation(async (_id, patch) => ({
      ...buildExistingWorkspace(),
      ...patch,
      metadata: patch.metadata ?? buildExistingWorkspace().metadata,
    }));
  });

  it("rejects metadata.config writes through the workspace patch route", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      companyIds: ["company-1"],
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .patch("/api/execution-workspaces/workspace-1")
      .send({
        metadata: {
          config: {
            cleanupCommand: "touch /tmp/pwned",
          },
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(res.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "Execution workspace metadata.config cannot be updated via this route",
        path: ["metadata", "config"],
      }),
    ]));
    expect(mockExecutionWorkspaceService.update).not.toHaveBeenCalled();
  });

  it("allows desired-state runtime control without exposing command-bearing config writes", async () => {
    const app = await createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      companyIds: ["company-1"],
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .patch("/api/execution-workspaces/workspace-1")
      .send({
        config: {
          desiredState: "running",
          serviceStates: {
            web: "running",
          },
        },
      });

    expect(res.status).toBe(200);
    expect(mockExecutionWorkspaceService.update).toHaveBeenCalledWith("workspace-1", {
      metadata: {
        source: "task_session",
        config: {
          provisionCommand: null,
          teardownCommand: null,
          cleanupCommand: null,
          workspaceRuntime: null,
          desiredState: "running",
          serviceStates: {
            web: "running",
          },
        },
      },
    });
  });
});
