import express from "express";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
}));
const mockGoalService = vi.hoisted(() => ({
  create: vi.fn(),
}));
const mockSecretService = vi.hoisted(() => ({
  normalizeEnvBindingsForPersistence: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockBuildProjectOperatingContextFromBaseline = vi.hoisted(() => vi.fn());
const mockIsExecutionContractComplete = vi.hoisted(() => vi.fn());
const mockBuildHiringBriefPreview = vi.hoisted(() => vi.fn());
const mockBuildHiringIssueCreateInput = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());
const mockStartRuntimeServicesForWorkspaceControl = vi.hoisted(() => vi.fn());
const mockStopRuntimeServicesForProjectWorkspace = vi.hoisted(() => vi.fn());

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: mockGetTelemetryClient,
}));

vi.mock("../services/index.js", () => ({
  buildProjectOperatingContextFromBaseline: mockBuildProjectOperatingContextFromBaseline,
  isExecutionContractComplete: mockIsExecutionContractComplete,
  buildHiringBriefPreview: mockBuildHiringBriefPreview,
  buildHiringIssueCreateInput: mockBuildHiringIssueCreateInput,
  goalService: () => mockGoalService,
  logActivity: mockLogActivity,
  issueService: () => mockIssueService,
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
    buildProjectOperatingContextFromBaseline: mockBuildProjectOperatingContextFromBaseline,
    isExecutionContractComplete: mockIsExecutionContractComplete,
    buildHiringBriefPreview: mockBuildHiringBriefPreview,
    buildHiringIssueCreateInput: mockBuildHiringIssueCreateInput,
    goalService: () => mockGoalService,
    logActivity: mockLogActivity,
    issueService: () => mockIssueService,
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
    operatingContext: null,
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

function buildIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    companyId: "company-1",
    projectId: "project-1",
    projectWorkspaceId: "workspace-1",
    goalId: null,
    parentId: null,
    title: "Repository documentation baseline",
    description: null,
    status: "backlog",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: "board-user",
    issueNumber: 1,
    identifier: "PAP-1",
    originKind: "manual",
    originId: null,
    originRunId: null,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionPolicy: null,
    executionState: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    labelIds: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("project env routes", () => {
  const originalAnalyzerTimeout = process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS;

  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/projects.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = "paperclip-missing-baseline-codex";
    if (originalAnalyzerTimeout === undefined) delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS;
    else process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS = originalAnalyzerTimeout;
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockProjectService.resolveByReference.mockResolvedValue({ ambiguous: false, project: null });
    mockProjectService.createWorkspace.mockResolvedValue(null);
    mockProjectService.listWorkspaces.mockResolvedValue([]);
    mockGoalService.create.mockResolvedValue({
      id: "goal-created-1",
      companyId: "company-1",
      title: "Stabilize platform baseline",
      description: "Adopt project operating defaults from the accepted baseline.",
      status: "planned",
      level: "team",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockIssueService.create.mockResolvedValue(buildIssue());
    mockIssueService.getById.mockResolvedValue(null);
    mockIssueService.listLabels.mockResolvedValue([]);
    mockIssueService.createLabel.mockImplementation(async (_companyId, data) => ({
      id: `label-${data.name}`,
      companyId: "company-1",
      name: data.name,
      color: data.color,
      description: data.description ?? null,
      source: data.source ?? "manual",
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockIssueService.updateLabel.mockImplementation(async (id, data) => ({
      id,
      companyId: "company-1",
      name: "docs",
      color: "#64748b",
      description: data.description ?? null,
      source: data.source ?? "manual",
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockIssueService.update.mockImplementation(async (id, data) => buildIssue({
      id,
      description: data.description ?? null,
      labelIds: data.labelIds ?? [],
    }));
    mockSecretService.normalizeEnvBindingsForPersistence.mockImplementation(async (_companyId, env) => env);
    mockStartRuntimeServicesForWorkspaceControl.mockResolvedValue([]);
    mockStopRuntimeServicesForProjectWorkspace.mockResolvedValue(undefined);
    mockBuildProjectOperatingContextFromBaseline.mockReturnValue({
      baselineStatus: "accepted",
      baselineAcceptedAt: "2026-04-21T00:00:00.000Z",
      executionReadiness: "needs_operator_contract",
      executionReadinessUpdatedAt: "2026-04-21T00:00:00.000Z",
      executionContract: null,
      baselineTrackingIssueId: null,
      baselineTrackingIssueIdentifier: null,
      baselineFingerprint: "ready:2026-04-21T00:00:00.000Z",
      overviewSummary: "Existing baseline",
      configurationDescriptionSuggestion: "Existing baseline",
      descriptionSource: "none",
      labelCatalog: [],
      canonicalDocs: ["AGENTS.md"],
      verificationCommands: ["pnpm -r typecheck"],
      ownershipAreas: [],
      operatingGuidance: [],
      suggestedGoals: [],
      executiveProjectPacket: null,
      technicalProjectPacket: null,
    });
    mockIsExecutionContractComplete.mockImplementation((contract) => Boolean(
      contract
      && contract.packageManager
      && contract.installCommand
      && Array.isArray(contract.verificationCommands)
      && contract.verificationCommands.length > 0
      && contract.envHandoff
      && contract.designAuthority
    ));
    mockBuildHiringBriefPreview.mockImplementation(({ projectName, operatingContext }) => (
      operatingContext?.baselineStatus === "accepted"
        ? {
            role: "cto",
            title: `Hire CTO for ${projectName}`,
            summary: operatingContext.overviewSummary ?? `Technical hiring brief for ${projectName}.`,
            sourceSignals: [
              "Accepted repository baseline",
              ...(operatingContext.executionReadiness === "ready" ? [] : ["Open execution clarifications"]),
            ],
            rationale: ["Repository needs a technical owner."],
            projectContext: ["Stack signals: Next.js, TypeScript"],
            risks: [
              "Missing operational docs",
              ...(operatingContext.executionReadiness === "ready"
                ? []
                : ["Confirm the canonical package manager and runtime for this repository."]),
            ],
            expectedFirstOutput: [
              "Publish a concise technical onboarding and framing comment before implementation begins.",
              ...(operatingContext.executionReadiness === "ready"
                ? []
                : ["Close the open execution clarifications as part of the first technical framing pass."]),
            ],
            guardrails: ["Treat the baseline issue as the canonical technical source of truth for this repository."],
            canonicalReferences: operatingContext.baselineTrackingIssueIdentifier
              ? [{ type: "issue", label: "Canonical baseline issue", value: operatingContext.baselineTrackingIssueIdentifier }]
              : [],
            successCriteria: ["A grounded technical onboarding comment is published in the first response."],
          }
        : null
    ));
    mockBuildHiringIssueCreateInput.mockImplementation(({ projectId, projectWorkspaceId, baselineIssueId, preview, actorUserId, actorAgentId }) => ({
      projectId,
      projectWorkspaceId,
      parentId: baselineIssueId,
      title: preview.title,
      description: preview.summary,
      status: "backlog",
      priority: "high",
      assigneeAgentId: null,
      assigneeUserId: null,
      requestDepth: 0,
      originKind: "staffing_hiring",
      originId: baselineIssueId,
      createdByAgentId: actorAgentId,
      createdByUserId: actorUserId,
    }));
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

  it("refreshes repository baseline without replacing existing workspace metadata", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-baseline-route-"));
    await mkdir(path.join(repoRoot, "doc"), { recursive: true });
    await writeFile(path.join(repoRoot, "README.md"), "# Route baseline\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent instructions\n", "utf8");
    await writeFile(path.join(repoRoot, "doc", "PRODUCT.md"), "# Product context\n", "utf8");
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest" },
        dependencies: { express: "^5.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
      "utf8",
    );
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        workspaceRuntime: { commands: [{ id: "web" }] },
      },
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      workspaces: [workspace],
    }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.baseline).toMatchObject({
      status: "ready",
      source: "scan",
      repository: {
        cwd: repoRoot,
        repoUrl: "https://github.com/example/repo",
        repoRef: "main",
        defaultRef: "main",
      },
      constraints: {
        repositoryWritesAllowed: false,
        backlogGenerationAllowed: false,
        childIssuesAllowed: false,
        agentWakeupAllowed: false,
      },
    });
    expect(res.body.baseline.documentationFiles).toEqual(expect.arrayContaining([
      "README.md",
      "AGENTS.md",
      "doc/PRODUCT.md",
      "package.json",
    ]));
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith(
      "project-1",
      "workspace-1",
      {
        metadata: expect.objectContaining({
          workspaceRuntime: { commands: [{ id: "web" }] },
          repositoryDocumentationBaseline: expect.objectContaining({
            source: "scan",
            documentationFiles: expect.arrayContaining(["AGENTS.md", "doc/PRODUCT.md"]),
          }),
        }),
      },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.workspace_repository_baseline_refreshed",
        details: expect.objectContaining({
          workspaceId: "workspace-1",
          status: "ready",
        }),
      }),
    );
  });

  it("runs repository baseline analyzer only when requested", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-baseline-route-analyzer-"));
    const analyzerPath = path.join(repoRoot, "fake-analyzer.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Route analyzer baseline\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent instructions\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"architectureSummary\":\"Route analyzer summary.\",\"stackCorrections\":[\"Event bus\"],\"suggestedLabels\":[],\"canonicalDocs\":[\"AGENTS.md\"],\"ownershipAreas\":[],\"verificationCommands\":[\"pnpm proof:baseline\"],\"agentGuidance\":[\"Keep baseline work in one issue.\"],\"risks\":[]}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {},
    };
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({ runAnalyzer: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "custom_command",
      summary: "Route analyzer summary.",
      agentGuidance: ["Keep baseline work in one issue."],
    });
    expect(res.body.baseline.stack).toContain("Event bus");
    expect(res.body.baseline.recommendations.projectDefaults.suggestedVerificationCommands).toContain("pnpm proof:baseline");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.workspace_repository_baseline_refreshed",
        details: expect.objectContaining({
          analyzerStatus: "succeeded",
        }),
      }),
    );
  });

  it("does not run the repository baseline analyzer unless explicitly requested", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-baseline-route-no-analyzer-"));
    const analyzerPath = path.join(repoRoot, "should-not-run.sh");
    const markerPath = path.join(repoRoot, "route-should-not-run.txt");
    await writeFile(path.join(repoRoot, "README.md"), "# Route baseline\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        `printf '%s' ran > ${JSON.stringify(markerPath)}`,
        "exit 0",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {},
    };
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.baseline.analysis).toBeNull();
    await expect(readFile(markerPath, "utf8")).rejects.toThrow();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.workspace_repository_baseline_refreshed",
        details: expect.objectContaining({
          analyzerStatus: null,
        }),
      }),
    );
  });

  it("writes analyzer failure details into the repository baseline tracking issue description", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-baseline-route-issue-analyzer-failed-"));
    const analyzerPath = path.join(repoRoot, "fake-analyzer-fail.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Route baseline\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' 'analyzer stderr from route test' >&2",
        "exit 2",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const existingIssue = buildIssue({
      id: "tracking-issue-1",
      identifier: "PAP-1",
      title: "Repository documentation baseline for Project",
    });
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: {
          status: "ready",
          source: "scan",
          updatedAt: "2026-04-21T00:00:00.000Z",
          summary: "Existing baseline",
          stack: [],
          documentationFiles: ["README.md"],
          guardrails: [],
          trackingIssueId: "tracking-issue-1",
          trackingIssueIdentifier: "PAP-1",
        },
      },
    };
    mockIssueService.getById.mockResolvedValue(existingIssue);
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({ createTrackingIssue: true, runAnalyzer: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.baseline.analysis).toMatchObject({
      status: "failed",
      provider: "custom_command",
      error: "analyzer stderr from route test",
    });
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "tracking-issue-1",
      expect.objectContaining({
        description: expect.stringContaining("AI analyzer enrichment:"),
        actorUserId: "board-user",
        actorAgentId: null,
      }),
    );
    const description = mockIssueService.update.mock.calls.at(-1)?.[1]?.description as string;
    expect(description).toContain("- Status: failed");
    expect(description).toContain("- Error: analyzer stderr from route test");
    expect(description).toContain("- Raw output excerpt:");
    expect(description).toContain("analyzer stderr from route test");
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith(
      "project-1",
      "workspace-1",
      {
        metadata: expect.objectContaining({
          repositoryDocumentationBaseline: expect.objectContaining({
            analysis: expect.objectContaining({
              status: "failed",
              rawOutput: "analyzer stderr from route test",
            }),
          }),
        }),
      },
    );
  });

  it("reads repository baseline from workspace metadata without mutating the workspace", async () => {
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: null,
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: {
          status: "ready",
          source: "scan",
          updatedAt: "2026-04-20T12:00:00.000Z",
          summary: "Repo identity only.",
          stack: [],
          documentationFiles: [],
          guardrails: ["Documentation only"],
          gaps: ["No local workspace path is configured, so only repository identity was recorded."],
        },
      },
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      workspaces: [workspace],
    }));

    const app = await createApp();
    const res = await request(app)
      .get("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      baseline: {
        status: "ready",
        source: "scan",
        summary: "Repo identity only.",
        gaps: ["No local workspace path is configured, so only repository identity was recorded."],
      },
      workspace: {
        id: "workspace-1",
      },
    });
    expect(mockProjectService.updateWorkspace).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects agent actors for repository baseline refresh", async () => {
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
          metadata: {},
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
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toEqual({ error: "Board access required" });
    expect(mockProjectService.updateWorkspace).not.toHaveBeenCalled();
  });

  it("creates an operator-controlled repository baseline tracking issue when requested", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-baseline-route-"));
    await mkdir(path.join(repoRoot, "doc"), { recursive: true });
    await writeFile(path.join(repoRoot, "README.md"), "# Route baseline\n", "utf8");
    await writeFile(path.join(repoRoot, "doc", "PRODUCT.md"), "# Product context\n", "utf8");
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {},
    };
    const createdIssue = buildIssue({
      id: "tracking-issue-1",
      identifier: "PAP-1",
      title: "Repository documentation baseline for Project",
    });
    mockIssueService.create.mockResolvedValue(createdIssue);
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({ createTrackingIssue: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        projectId: "project-1",
        projectWorkspaceId: "workspace-1",
        parentId: null,
        assigneeAgentId: null,
        assigneeUserId: null,
        status: "backlog",
        title: "Repository documentation baseline for Project",
        description: expect.stringContaining("This is not backlog decomposition."),
        createdByAgentId: null,
        createdByUserId: "board-user",
      }),
    );
    expect(mockIssueService.create.mock.calls[0]?.[1]?.description).toContain("Do not create child issues.");
    expect(mockIssueService.create.mock.calls[0]?.[1]?.description).toContain(
      "Do not wake agents except for an explicit operator-requested CEO baseline review.",
    );
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith(
      "project-1",
      "workspace-1",
      {
        metadata: expect.objectContaining({
          repositoryDocumentationBaseline: expect.objectContaining({
            trackingIssueId: "tracking-issue-1",
            trackingIssueIdentifier: "PAP-1",
          }),
        }),
      },
    );
    expect(res.body.trackingIssue).toMatchObject({
      id: "tracking-issue-1",
      identifier: "PAP-1",
    });
  });

  it("reuses an existing repository baseline tracking issue instead of creating duplicates", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "paperclip-baseline-route-"));
    await writeFile(path.join(repoRoot, "README.md"), "# Route baseline\n", "utf8");
    const existingIssue = buildIssue({
      id: "tracking-issue-1",
      identifier: "PAP-1",
      title: "Repository documentation baseline for Project",
    });
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: {
          status: "ready",
          source: "scan",
          updatedAt: "2026-04-21T00:00:00.000Z",
          summary: "Existing baseline",
          stack: [],
          documentationFiles: ["README.md"],
          guardrails: [],
          trackingIssueId: "tracking-issue-1",
          trackingIssueIdentifier: "PAP-1",
        },
      },
    };
    mockIssueService.getById.mockResolvedValue(existingIssue);
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline")
      .send({ createTrackingIssue: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockIssueService.getById).toHaveBeenCalledWith("tracking-issue-1");
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockIssueService.update).toHaveBeenCalledWith("tracking-issue-1", expect.objectContaining({
      description: expect.stringContaining("Detected documentation files:"),
      actorUserId: "board-user",
      actorAgentId: null,
    }));
    expect(res.body.trackingIssue).toMatchObject({
      id: "tracking-issue-1",
      identifier: "PAP-1",
    });
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith(
      "project-1",
      "workspace-1",
      {
        metadata: expect.objectContaining({
          repositoryDocumentationBaseline: expect.objectContaining({
            trackingIssueId: "tracking-issue-1",
            trackingIssueIdentifier: "PAP-1",
          }),
        }),
      },
    );
  });

  it("applies repository baseline recommendations without creating issues or agent wakeups", async () => {
    const baseline = {
      status: "ready",
      source: "scan",
      updatedAt: "2026-04-21T00:00:00.000Z",
      summary: "Existing baseline",
      stack: ["TypeScript", "React"],
      documentationFiles: ["README.md", "AGENTS.md"],
      guardrails: ["Documentation only"],
      recommendationDecisions: [
        {
          kind: "label",
          key: "frontend",
          decision: "accepted",
          decidedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      recommendations: {
        labels: [
          {
            name: "frontend",
            color: "#2563eb",
            description: "UI and browser-visible behavior.",
            evidence: ["React"],
            confidence: "high",
          },
          {
            name: "docs",
            color: "#64748b",
            description: "Documentation and operating instructions.",
            evidence: ["AGENTS.md"],
            confidence: "high",
          },
        ],
        issuePolicy: {
          parentChildGuidance: ["Use parentId only for explicit decomposition."],
          blockingGuidance: ["Use blockedByIssueIds only for concrete blockers."],
          labelUsageGuidance: ["Use frontend for UI work."],
          reviewGuidance: ["Use review for technical correctness."],
          approvalGuidance: ["Use approval for operator decisions."],
        },
        projectDefaults: {
          canonicalDocs: ["AGENTS.md"],
          suggestedVerificationCommands: ["pnpm -r typecheck"],
          ownershipAreas: [
            { name: "Frontend", paths: ["ui/"], recommendedLabels: ["frontend"] },
          ],
        },
      },
    };
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: baseline,
      },
    };
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockIssueService.listLabels.mockResolvedValue([
      {
        id: "label-existing-docs",
        companyId: "company-1",
        name: "docs",
        color: "#64748b",
        description: null,
        source: "manual",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline/apply-recommendations")
      .send({ applyLabels: true, acceptIssueGuidance: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockIssueService.createLabel).toHaveBeenCalledWith("company-1", {
      name: "frontend",
      color: "#2563eb",
      description: "UI and browser-visible behavior.",
      source: "repository_baseline",
      metadata: {
        baselineEvidence: ["React"],
        baselineConfidence: "high",
        baselineProjectId: "project-1",
        baselineWorkspaceId: "workspace-1",
      },
    });
    expect(mockIssueService.updateLabel).toHaveBeenCalledWith("label-existing-docs", {
      description: "Documentation and operating instructions.",
      source: "repository_baseline",
      metadata: {
        baselineEvidence: ["AGENTS.md"],
        baselineConfidence: "high",
        baselineProjectId: "project-1",
        baselineWorkspaceId: "workspace-1",
      },
    });
    expect(mockProjectService.update).toHaveBeenCalledWith("project-1", {
      issueSystemGuidance: expect.objectContaining({
        labelUsageGuidance: ["Use frontend for UI work."],
        parentChildGuidance: ["Use parentId only for explicit decomposition."],
      }),
      operatingContext: expect.objectContaining({
        baselineStatus: "available",
        executionReadiness: "unknown",
        baselineTrackingIssueIdentifier: null,
        overviewSummary: "Existing baseline",
        canonicalDocs: ["AGENTS.md"],
      }),
    });
    expect(res.body.labels.created).toHaveLength(1);
    expect(res.body.labels.existing).toHaveLength(1);
    expect(res.body.baseline.acceptedGuidance).toMatchObject({
      labels: expect.arrayContaining([expect.objectContaining({ name: "frontend" })]),
      issuePolicy: expect.objectContaining({
        parentChildGuidance: ["Use parentId only for explicit decomposition."],
      }),
    });
    expect(res.body.baseline.recommendationDecisions).toHaveLength(4);
    expect(res.body.baseline.recommendationDecisions.filter((entry: { key: string }) => entry.key === "frontend")).toHaveLength(1);
    expect(mockProjectService.updateWorkspace).toHaveBeenCalledWith(
      "project-1",
      "workspace-1",
      {
        metadata: expect.objectContaining({
          repositoryDocumentationBaseline: expect.objectContaining({
            acceptedGuidance: expect.objectContaining({
              acceptedByUserId: "board-user",
            }),
          }),
        }),
      },
    );
  });

  it("accepts a suggested goal and links it into project operating context", async () => {
    const project = buildProject({
      goalIds: [],
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-21T00:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "ready:2026-04-21T00:00:00.000Z",
        overviewSummary: "Existing baseline",
        configurationDescriptionSuggestion: "Existing baseline",
        descriptionSource: "none",
        labelCatalog: [],
        canonicalDocs: ["AGENTS.md"],
        verificationCommands: ["pnpm -r typecheck"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [
          {
            key: "stabilize-platform-baseline",
            title: "Stabilize platform baseline",
            description: "Adopt project operating defaults from the accepted baseline.",
            reason: "Baseline identified missing project defaults.",
            recommendedLabels: ["docs"],
            suggestedVerificationCommands: ["pnpm -r typecheck"],
            source: "repository_baseline",
            status: "pending",
            acceptedGoalId: null,
          },
        ],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });
    mockProjectService.getById.mockResolvedValue(project);
    mockProjectService.update.mockImplementation(async (id, data) =>
      buildProject({
        id,
        goalIds: data.goalIds ?? [],
        operatingContext: data.operatingContext ?? project.operatingContext,
      }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/operating-context/suggested-goals/stabilize-platform-baseline/accept")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockGoalService.create).toHaveBeenCalledWith("company-1", {
      title: "Stabilize platform baseline",
      description: "Adopt project operating defaults from the accepted baseline.",
      level: "team",
      status: "planned",
      parentId: null,
      ownerAgentId: null,
    });
    expect(mockProjectService.update).toHaveBeenCalledWith("project-1", {
      goalIds: ["goal-created-1"],
      operatingContext: expect.objectContaining({
        suggestedGoals: [
          expect.objectContaining({
            key: "stabilize-platform-baseline",
            status: "accepted",
            acceptedGoalId: "goal-created-1",
          }),
        ],
      }),
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.operating_context_suggested_goal_accepted",
        details: expect.objectContaining({
          key: "stabilize-platform-baseline",
          goalId: "goal-created-1",
        }),
      }),
    );
  });

  it("accepts repository context without marking execution readiness ready", async () => {
    const baseline = {
      status: "ready",
      source: "scan",
      updatedAt: "2026-04-21T00:00:00.000Z",
      summary: "Existing baseline",
      stack: ["TypeScript", "React"],
      documentationFiles: ["README.md", "AGENTS.md"],
      guardrails: ["Documentation only"],
      recommendations: {
        labels: [],
        issuePolicy: {
          parentChildGuidance: ["Use parentId only for explicit decomposition."],
          blockingGuidance: ["Use blockedByIssueIds only for concrete blockers."],
          labelUsageGuidance: ["Use frontend for UI work."],
          reviewGuidance: ["Use review for technical correctness."],
          approvalGuidance: ["Use approval for operator decisions."],
        },
        projectDefaults: {
          canonicalDocs: ["AGENTS.md"],
          suggestedVerificationCommands: ["pnpm -r typecheck"],
          ownershipAreas: [],
        },
      },
      acceptedGuidance: null,
      recommendationDecisions: [],
      trackingIssueId: null,
      trackingIssueIdentifier: null,
    };
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: baseline,
      },
    };
    mockProjectService.getById.mockResolvedValue(buildProject({ workspaces: [workspace] }));
    mockProjectService.updateWorkspace.mockImplementation(async (_projectId, _workspaceId, data) => ({
      ...workspace,
      ...data,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline/accept")
      .send({ acceptIssueGuidance: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.update).toHaveBeenCalledWith("project-1", {
      issueSystemGuidance: expect.objectContaining({
        labelUsageGuidance: ["Use frontend for UI work."],
      }),
      operatingContext: expect.objectContaining({
        baselineStatus: "accepted",
        executionReadiness: "needs_operator_contract",
        canonicalDocs: ["AGENTS.md"],
      }),
    });
  });

  it("marks execution context ready before staffing and closes the baseline issue", async () => {
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: {
          status: "ready",
          source: "scan",
          updatedAt: "2026-04-21T00:00:00.000Z",
          summary: "Existing baseline",
          stack: [],
          documentationFiles: [],
          guardrails: ["Documentation only"],
          recommendations: {
            labels: [],
            issuePolicy: {
              parentChildGuidance: [],
              blockingGuidance: [],
              labelUsageGuidance: [],
              reviewGuidance: [],
              approvalGuidance: [],
            },
            projectDefaults: {
              canonicalDocs: [],
              suggestedVerificationCommands: [],
              ownershipAreas: [],
            },
          },
          acceptedGuidance: {
            acceptedAt: "2026-04-21T00:05:00.000Z",
            acceptedByUserId: "board-user",
            labels: [],
            issuePolicy: {
              parentChildGuidance: [],
              blockingGuidance: [],
              labelUsageGuidance: [],
              reviewGuidance: [],
              approvalGuidance: [],
            },
            projectDefaults: {
              canonicalDocs: [],
              suggestedVerificationCommands: [],
              ownershipAreas: [],
            },
          },
          recommendationDecisions: [],
          trackingIssueId: "11111111-1111-4111-8111-111111111111",
          trackingIssueIdentifier: "BOT-1",
        },
      },
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      workspaces: [workspace],
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-21T00:05:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-21T00:05:00.000Z",
        executionContract: {
          packageManager: "pnpm on Node 22",
          installCommand: "pnpm install",
          verificationCommands: ["pnpm -r typecheck", "pnpm test"],
          envHandoff: "Use .env.local plus company secrets.",
          designAuthority: "design-system.contract is authoritative.",
          updatedAt: "2026-04-21T00:05:00.000Z",
        },
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "BOT-1",
        baselineFingerprint: "ready:2026-04-21T00:00:00.000Z",
        overviewSummary: "Existing baseline",
        configurationDescriptionSuggestion: "Existing baseline",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Existing baseline",
          baselineTrackingIssueIdentifier: "BOT-1",
          topRisks: [],
          topGaps: [],
          stackSummary: ["React"],
          docsToReadFirst: [],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline/execution-ready")
      .send({ ready: true });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.update).toHaveBeenCalledWith("project-1", {
      operatingContext: expect.objectContaining({
        baselineStatus: "accepted",
        executionReadiness: "ready",
      }),
    });
    expect(mockIssueService.update).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", expect.objectContaining({
      status: "done",
    }));
  });

  it("updates the execution contract after repository context acceptance", async () => {
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: null,
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      workspaces: [workspace],
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-21T00:05:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-21T00:05:00.000Z",
        executionContract: null,
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "BOT-1",
        baselineFingerprint: "ready:2026-04-21T00:00:00.000Z",
        overviewSummary: "Existing baseline",
        configurationDescriptionSuggestion: "Existing baseline",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline/execution-contract")
      .send({
        packageManager: "pnpm on Node 22",
        installCommand: "pnpm install",
        verificationCommands: ["pnpm -r typecheck", "pnpm test"],
        envHandoff: "Use .env.local plus company secrets.",
        designAuthority: "design-system.contract is authoritative.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockProjectService.update).toHaveBeenCalledWith("project-1", {
      operatingContext: expect.objectContaining({
        executionContract: expect.objectContaining({
          packageManager: "pnpm on Node 22",
          installCommand: "pnpm install",
          verificationCommands: ["pnpm -r typecheck", "pnpm test"],
        }),
      }),
    });
  });

  it("blocks execution readiness until the execution contract is complete", async () => {
    const workspace = {
      id: "workspace-1",
      name: "Workspace 1",
      isPrimary: true,
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
      metadata: {
        repositoryDocumentationBaseline: {
          status: "ready",
          source: "scan",
          updatedAt: "2026-04-21T00:00:00.000Z",
          summary: "Existing baseline",
          stack: [],
          documentationFiles: [],
          guardrails: ["Documentation only"],
          recommendations: {
            labels: [],
            issuePolicy: {
              parentChildGuidance: [],
              blockingGuidance: [],
              labelUsageGuidance: [],
              reviewGuidance: [],
              approvalGuidance: [],
            },
            projectDefaults: {
              canonicalDocs: [],
              suggestedVerificationCommands: [],
              ownershipAreas: [],
            },
          },
          acceptedGuidance: {
            acceptedAt: "2026-04-21T00:05:00.000Z",
            acceptedByUserId: "board-user",
            labels: [],
            issuePolicy: {
              parentChildGuidance: [],
              blockingGuidance: [],
              labelUsageGuidance: [],
              reviewGuidance: [],
              approvalGuidance: [],
            },
            projectDefaults: {
              canonicalDocs: [],
              suggestedVerificationCommands: [],
              ownershipAreas: [],
            },
          },
          recommendationDecisions: [],
          trackingIssueId: "11111111-1111-4111-8111-111111111111",
          trackingIssueIdentifier: "BOT-1",
        },
      },
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      workspaces: [workspace],
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-21T00:05:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-21T00:05:00.000Z",
        executionContract: {
          packageManager: "pnpm on Node 22",
          installCommand: null,
          verificationCommands: [],
          envHandoff: null,
          designAuthority: null,
          updatedAt: "2026-04-21T00:05:00.000Z",
        },
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "BOT-1",
        baselineFingerprint: "ready:2026-04-21T00:00:00.000Z",
        overviewSummary: "Existing baseline",
        configurationDescriptionSuggestion: "Existing baseline",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/repository-baseline/execution-ready")
      .send({ ready: true });

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toEqual({
      error: "Complete the execution contract before marking execution readiness.",
    });
  });

  it("rejects a suggested goal without creating a goal", async () => {
    const project = buildProject({
      goalIds: ["goal-existing-1"],
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-21T00:00:00.000Z",
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: null,
        baselineFingerprint: "ready:2026-04-21T00:00:00.000Z",
        overviewSummary: "Existing baseline",
        configurationDescriptionSuggestion: "Existing baseline",
        descriptionSource: "none",
        labelCatalog: [],
        canonicalDocs: ["AGENTS.md"],
        verificationCommands: ["pnpm -r typecheck"],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [
          {
            key: "stabilize-platform-baseline",
            title: "Stabilize platform baseline",
            description: "Adopt project operating defaults from the accepted baseline.",
            reason: "Baseline identified missing project defaults.",
            recommendedLabels: ["docs"],
            suggestedVerificationCommands: ["pnpm -r typecheck"],
            source: "repository_baseline",
            status: "pending",
            acceptedGoalId: null,
          },
        ],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
    });
    mockProjectService.getById.mockResolvedValue(project);
    mockProjectService.update.mockImplementation(async (id, data) =>
      buildProject({
        id,
        goalIds: data.goalIds ?? project.goalIds,
        operatingContext: data.operatingContext ?? project.operatingContext,
      }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/operating-context/suggested-goals/stabilize-platform-baseline/reject")
      .send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockGoalService.create).not.toHaveBeenCalled();
    expect(mockProjectService.update).toHaveBeenCalledWith("project-1", {
      operatingContext: expect.objectContaining({
        suggestedGoals: [
          expect.objectContaining({
            key: "stabilize-platform-baseline",
            status: "rejected",
          }),
        ],
      }),
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.operating_context_suggested_goal_rejected",
        details: { key: "stabilize-platform-baseline" },
      }),
    );
  });

  it("generates a hiring brief preview from accepted project context", async () => {
    const workspace = {
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "Primary workspace",
      sourceType: "local_path",
      cwd: "/tmp/project",
      repoUrl: "https://github.com/acme/project",
      repoRef: null,
      defaultRef: null,
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      runtimeConfig: null,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      name: "prop4you-nextjs-fullstack",
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        executionContract: null,
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "ready:2026-04-23T12:00:00.000Z",
        overviewSummary: "Existing Next.js repository.",
        configurationDescriptionSuggestion: "Existing Next.js repository.",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md", "AGENTS.md"],
        verificationCommands: ["pnpm test", "pnpm -r typecheck"],
        ownershipAreas: [
          { name: "web", paths: ["ui/src"], recommendedLabels: ["frontend"] },
        ],
        operatingGuidance: ["Read the baseline issue first."],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Existing Next.js repository.",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Missing operational docs"],
          topGaps: ["Ownership is not explicit."],
          stackSummary: ["Next.js", "TypeScript"],
          docsToReadFirst: ["README.md", "AGENTS.md"],
          operatingGuidance: ["Read the baseline issue first."],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: {
          projectSummary: "Existing Next.js repository.",
          stackSignals: ["Next.js", "TypeScript"],
          canonicalDocs: ["README.md", "AGENTS.md"],
          verificationCommands: ["pnpm test", "pnpm -r typecheck"],
          ownershipAreas: [
            { name: "web", paths: ["ui/src"], recommendedLabels: ["frontend"] },
          ],
          labelCatalog: [{ name: "frontend", description: "UI work." }],
          issueGuidance: ["Use frontend for UI work."],
        },
      },
      workspaces: [workspace],
      primaryWorkspace: workspace,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/staffing/hiring-brief-preview")
      .send({ role: "cto" });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.preview).toMatchObject({
      role: "cto",
      title: "Hire CTO for prop4you-nextjs-fullstack",
      canonicalReferences: expect.arrayContaining([
        expect.objectContaining({
          type: "issue",
          value: "P4Y-1",
        }),
      ]),
    });
    expect(res.body.preview.sourceSignals).toContain("Accepted repository baseline");
    expect(res.body.preview.sourceSignals).toContain("Open execution clarifications");
    expect(res.body.preview.projectContext).toEqual(
      expect.arrayContaining([expect.stringContaining("Stack signals")]),
    );
    expect(res.body.preview.risks).toEqual(
      expect.arrayContaining([expect.stringContaining("Confirm the canonical package manager and runtime")]),
    );
    expect(res.body.preview.expectedFirstOutput).toEqual(
      expect.arrayContaining([expect.stringContaining("Close the open execution clarifications")]),
    );
  });

  it("blocks hiring brief preview before baseline acceptance", async () => {
    const workspace = {
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "Primary workspace",
      sourceType: "local_path",
      cwd: "/tmp/project",
      repoUrl: "https://github.com/acme/project",
      repoRef: null,
      defaultRef: null,
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      runtimeConfig: null,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      operatingContext: {
        baselineStatus: "available",
        baselineAcceptedAt: null,
        baselineTrackingIssueId: null,
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: null,
        overviewSummary: null,
        configurationDescriptionSuggestion: null,
        descriptionSource: "none",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: null,
        technicalProjectPacket: null,
      },
      workspaces: [workspace],
      primaryWorkspace: workspace,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/staffing/hiring-brief-preview")
      .send({ role: "cto" });

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toEqual({
      error: "Accept the repository baseline before generating a hiring brief.",
    });
  });

  it("creates a staffing issue from the accepted hiring brief", async () => {
    const workspace = {
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "Primary workspace",
      sourceType: "local_path",
      cwd: "/tmp/project",
      repoUrl: "https://github.com/acme/project",
      repoRef: null,
      defaultRef: null,
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      runtimeConfig: null,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      name: "prop4you-nextjs-fullstack",
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        executionContract: null,
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "ready:2026-04-23T12:00:00.000Z",
        overviewSummary: "Existing Next.js repository.",
        configurationDescriptionSuggestion: "Existing Next.js repository.",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: ["README.md", "AGENTS.md"],
        verificationCommands: ["pnpm test", "pnpm -r typecheck"],
        ownershipAreas: [
          { name: "web", paths: ["ui/src"], recommendedLabels: ["frontend"] },
        ],
        operatingGuidance: ["Read the baseline issue first."],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Existing Next.js repository.",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: ["Missing operational docs"],
          topGaps: ["Ownership is not explicit."],
          stackSummary: ["Next.js", "TypeScript"],
          docsToReadFirst: ["README.md", "AGENTS.md"],
          operatingGuidance: ["Read the baseline issue first."],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: {
          projectSummary: "Existing Next.js repository.",
          stackSignals: ["Next.js", "TypeScript"],
          canonicalDocs: ["README.md", "AGENTS.md"],
          verificationCommands: ["pnpm test", "pnpm -r typecheck"],
          ownershipAreas: [
            { name: "web", paths: ["ui/src"], recommendedLabels: ["frontend"] },
          ],
          labelCatalog: [{ name: "frontend", description: "UI work." }],
          issueGuidance: ["Use frontend for UI work."],
        },
      },
      staffingState: null,
      workspaces: [workspace],
      primaryWorkspace: workspace,
    }));
    mockIssueService.create.mockResolvedValue(buildIssue({
      id: "issue-hire-1",
      identifier: "P4Y-2",
      parentId: "11111111-1111-4111-8111-111111111111",
      originKind: "staffing_hiring",
      originId: "11111111-1111-4111-8111-111111111111",
      title: "Hire CTO for prop4you-nextjs-fullstack",
      priority: "high",
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/staffing/hiring-issues")
      .send({ role: "cto" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.issue).toMatchObject({
      id: "issue-hire-1",
      identifier: "P4Y-2",
      originKind: "staffing_hiring",
      parentId: "11111111-1111-4111-8111-111111111111",
    });
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        projectId: "project-1",
        projectWorkspaceId: "workspace-1",
        parentId: "11111111-1111-4111-8111-111111111111",
        originKind: "staffing_hiring",
        originId: "11111111-1111-4111-8111-111111111111",
        title: "Hire CTO for prop4you-nextjs-fullstack",
        priority: "high",
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "project.staffing_issue_created",
        details: expect.objectContaining({
          issueId: "issue-hire-1",
          issueIdentifier: "P4Y-2",
          role: "cto",
        }),
      }),
    );
  });

  it("blocks staffing issue creation when one already exists", async () => {
    const workspace = {
      id: "workspace-1",
      companyId: "company-1",
      projectId: "project-1",
      name: "Primary workspace",
      sourceType: "local_path",
      cwd: "/tmp/project",
      repoUrl: "https://github.com/acme/project",
      repoRef: null,
      defaultRef: null,
      visibility: "default",
      setupCommand: null,
      cleanupCommand: null,
      remoteProvider: null,
      remoteWorkspaceRef: null,
      sharedWorkspaceKey: null,
      metadata: null,
      runtimeConfig: null,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockProjectService.getById.mockResolvedValue(buildProject({
      operatingContext: {
        baselineStatus: "accepted",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
        executionReadiness: "needs_operator_contract",
        executionReadinessUpdatedAt: "2026-04-23T12:10:00.000Z",
        executionContract: null,
        baselineTrackingIssueId: "11111111-1111-4111-8111-111111111111",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineFingerprint: "ready:2026-04-23T12:00:00.000Z",
        overviewSummary: "Existing Next.js repository.",
        configurationDescriptionSuggestion: "Existing Next.js repository.",
        descriptionSource: "baseline",
        labelCatalog: [],
        canonicalDocs: [],
        verificationCommands: [],
        ownershipAreas: [],
        operatingGuidance: [],
        suggestedGoals: [],
        executiveProjectPacket: {
          projectSummary: "Existing Next.js repository.",
          baselineTrackingIssueIdentifier: "P4Y-1",
          topRisks: [],
          topGaps: [],
          stackSummary: ["Next.js"],
          docsToReadFirst: ["README.md"],
          operatingGuidance: [],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: null,
      },
      staffingState: {
        recommendedRole: "cto",
        status: "issue_created",
        baselineIssueId: "11111111-1111-4111-8111-111111111111",
        baselineIssueIdentifier: "P4Y-1",
        hiringIssueId: "22222222-2222-4222-8222-222222222222",
        hiringIssueIdentifier: "P4Y-2",
        lastBriefGeneratedAt: null,
      },
      workspaces: [workspace],
      primaryWorkspace: workspace,
    }));

    const app = await createApp();
    const res = await request(app)
      .post("/api/projects/project-1/workspaces/workspace-1/staffing/hiring-issues")
      .send({ role: "cto" });

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toEqual({
      error: "A staffing issue already exists for this project.",
    });
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });
});
