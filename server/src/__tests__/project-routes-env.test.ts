import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProjectService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  remove: vi.fn(),
  resolveByReference: vi.fn(),
}));
const mockSecretService = vi.hoisted(() => ({
  normalizeEnvBindingsForPersistence: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());
const mockStartRuntimeServicesForWorkspaceControl = vi.hoisted(() => vi.fn());
const mockStopRuntimeServicesForProjectWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: mockGetTelemetryClient,
}));

vi.mock("../services/index.js", () => ({
  logActivity: mockLogActivity,
  projectService: () => mockProjectService,
  secretService: () => mockSecretService,
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

vi.mock("../services/workspace-runtime.js", () => ({
  startRuntimeServicesForWorkspaceControl: mockStartRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForProjectWorkspace: mockStopRuntimeServicesForProjectWorkspace,
}));

function registerModuleMocks() {
  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));

  vi.doMock("../services/index.js", () => ({
    logActivity: mockLogActivity,
    projectService: () => mockProjectService,
    secretService: () => mockSecretService,
    workspaceOperationService: () => mockWorkspaceOperationService,
  }));

  vi.doMock("../services/workspace-runtime.js", () => ({
    startRuntimeServicesForWorkspaceControl: mockStartRuntimeServicesForWorkspaceControl,
    stopRuntimeServicesForProjectWorkspace: mockStopRuntimeServicesForProjectWorkspace,
  }));
}

async function createApp(actorOverrides: Partial<Record<string, unknown>> = {}) {
  const [{ projectRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/projects.js")>("../routes/projects.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "board-user",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
      ...actorOverrides,
    };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function buildProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Project",
    description: null,
    status: "backlog",
    leadAgentId: null,
    targetDate: null,
    color: null,
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project",
      effectiveLocalFolder: "/tmp/project",
      origin: "managed_checkout",
    },
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("project env routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/projects.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockProjectService.resolveByReference.mockResolvedValue({ ambiguous: false, project: null });
    mockProjectService.createWorkspace.mockResolvedValue(null);
    mockProjectService.listWorkspaces.mockResolvedValue([]);
    mockSecretService.normalizeEnvBindingsForPersistence.mockImplementation(async (_companyId, env) => env);
    mockStartRuntimeServicesForWorkspaceControl.mockResolvedValue([]);
    mockStopRuntimeServicesForProjectWorkspace.mockResolvedValue(undefined);
  });

  it("normalizes env bindings on create and logs only env keys", async () => {
    const normalizedEnv = {
      API_KEY: {
        type: "secret_ref",
        secretId: "11111111-1111-4111-8111-111111111111",
        version: "latest",
      },
    };
    mockSecretService.normalizeEnvBindingsForPersistence.mockResolvedValue(normalizedEnv);
    mockProjectService.create.mockResolvedValue(buildProject({ env: normalizedEnv }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/company-1/projects")
      .send({
        name: "Project",
        env: normalizedEnv,
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockSecretService.normalizeEnvBindingsForPersistence).toHaveBeenCalledWith(
      "company-1",
      normalizedEnv,
      expect.objectContaining({ fieldPath: "env" }),
    );
    expect(mockProjectService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ env: normalizedEnv }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: expect.objectContaining({
          envKeys: ["API_KEY"],
        }),
      }),
    );
  });

  it("normalizes env bindings on update and avoids logging raw values", async () => {
    const normalizedEnv = {
      PLAIN_KEY: { type: "plain", value: "top-secret" },
    };
    mockSecretService.normalizeEnvBindingsForPersistence.mockResolvedValue(normalizedEnv);
    mockProjectService.getById.mockResolvedValue(buildProject());
    mockProjectService.update.mockResolvedValue(buildProject({ env: normalizedEnv }));

    const app = await createApp();
    const res = await request(app)
      .patch("/api/projects/project-1")
      .send({
        env: normalizedEnv,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details: {
          changedKeys: ["env"],
          envKeys: ["PLAIN_KEY"],
        },
      }),
    );
  });

  it("rejects runtime service controls for agent actors", async () => {
    mockProjectService.getById.mockResolvedValue(buildProject({
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          isPrimary: true,
          cwd: "/tmp/workspace-1",
          repoUrl: null,
          repoRef: null,
          defaultRef: null,
          runtimeConfig: { workspaceRuntime: { services: [{ name: "web", command: "pnpm dev" }] } },
          runtimeServices: [],
        },
      ],
    }));

    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      source: "api_key",
    });
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/runtime-services/start")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Board access required" });
    expect(mockStartRuntimeServicesForWorkspaceControl).not.toHaveBeenCalled();
  });

  it("rejects non-admin project creation that sets workspace provision commands", async () => {
    const app = await createApp({
      source: "token",
      isInstanceAdmin: false,
    });
    const res = await request(app)
      .post("/api/companies/company-1/projects")
      .send({
        name: "Project",
        executionWorkspacePolicy: {
          enabled: true,
          workspaceStrategy: {
            provisionCommand: "bash ./scripts/provision.sh",
          },
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(mockProjectService.create).not.toHaveBeenCalled();
  });

  it("allows instance-admin project creation that sets workspace provision commands", async () => {
    const createdProject = buildProject({
      executionWorkspacePolicy: {
        enabled: true,
        workspaceStrategy: {
          provisionCommand: "bash ./scripts/provision.sh",
        },
      },
    });
    mockProjectService.create.mockResolvedValue(createdProject);

    const app = await createApp({
      source: "token",
      isInstanceAdmin: true,
    });
    const res = await request(app)
      .post("/api/companies/company-1/projects")
      .send({
        name: "Project",
        executionWorkspacePolicy: {
          enabled: true,
          workspaceStrategy: {
            provisionCommand: "bash ./scripts/provision.sh",
          },
        },
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockProjectService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        executionWorkspacePolicy: expect.objectContaining({
          workspaceStrategy: expect.objectContaining({
            provisionCommand: "bash ./scripts/provision.sh",
          }),
        }),
      }),
    );
  });

  it("rejects non-admin project updates that set workspace provision commands", async () => {
    mockProjectService.getById.mockResolvedValue(buildProject());

    const app = await createApp({
      source: "token",
      isInstanceAdmin: false,
    });
    const res = await request(app)
      .patch("/api/projects/project-1")
      .send({
        executionWorkspacePolicy: {
          enabled: true,
          workspaceStrategy: {
            provisionCommand: "bash ./scripts/provision.sh",
          },
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(mockProjectService.update).not.toHaveBeenCalled();
  });

  it("allows instance-admin project updates that set workspace provision commands", async () => {
    const updatedProject = buildProject({
      executionWorkspacePolicy: {
        enabled: true,
        workspaceStrategy: {
          provisionCommand: "bash ./scripts/provision.sh",
        },
      },
    });
    mockProjectService.getById.mockResolvedValue(buildProject());
    mockProjectService.update.mockResolvedValue(updatedProject);

    const app = await createApp({
      source: "token",
      isInstanceAdmin: true,
    });
    const res = await request(app)
      .patch("/api/projects/project-1")
      .send({
        executionWorkspacePolicy: {
          enabled: true,
          workspaceStrategy: {
            provisionCommand: "bash ./scripts/provision.sh",
          },
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        executionWorkspacePolicy: expect.objectContaining({
          workspaceStrategy: expect.objectContaining({
            provisionCommand: "bash ./scripts/provision.sh",
          }),
        }),
      }),
    );
  });
});
