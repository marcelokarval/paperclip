import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  listPrincipalGrants: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalPermission: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
}));
const mockBudgetService = vi.hoisted(() => ({}));
const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));
const mockIssueApprovalService = vi.hoisted(() => ({
  linkManyForApproval: vi.fn(),
}));
const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockAgentInstructionsService = vi.hoisted(() => ({
  getBundle: vi.fn(),
  readFile: vi.fn(),
  updateBundle: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  exportFiles: vi.fn(),
  ensureManagedBundle: vi.fn(),
  materializeManagedBundle: vi.fn(),
}));

const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  resolveAdapterConfigForRuntime: vi.fn(),
  normalizeAdapterConfigForPersistence: vi.fn(async (_companyId: string, config: Record<string, unknown>) => config),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockTrackAgentCreated = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());
const mockSyncInstructionsBundleConfigFromFilePath = vi.hoisted(() => vi.fn());

const mockAdapter = vi.hoisted(() => ({
  listSkills: vi.fn(),
  syncSkills: vi.fn(),
}));

vi.mock("@paperclipai/shared/telemetry", () => ({
  trackAgentCreated: mockTrackAgentCreated,
  trackErrorHandlerCrash: vi.fn(),
}));

vi.mock("../telemetry.js", () => ({
  getTelemetryClient: mockGetTelemetryClient,
}));

vi.mock("../services/index.js", () => ({
  agentService: () => mockAgentService,
  agentInstructionsService: () => mockAgentInstructionsService,
  accessService: () => mockAccessService,
  approvalService: () => mockApprovalService,
  companySkillService: () => mockCompanySkillService,
  budgetService: () => mockBudgetService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => mockIssueApprovalService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => mockProjectService,
  secretService: () => mockSecretService,
  syncInstructionsBundleConfigFromFilePath: mockSyncInstructionsBundleConfigFromFilePath,
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

vi.mock("../adapters/index.js", () => ({
  findServerAdapter: vi.fn(() => mockAdapter),
  findActiveServerAdapter: vi.fn(() => mockAdapter),
  listAdapterModels: vi.fn(),
  detectAdapterModel: vi.fn(),
}));

function registerModuleMocks() {
  vi.doMock("@paperclipai/shared/telemetry", () => ({
    trackAgentCreated: mockTrackAgentCreated,
    trackErrorHandlerCrash: vi.fn(),
  }));

  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));

  vi.doMock("../services/index.js", () => ({
    agentService: () => mockAgentService,
    agentInstructionsService: () => mockAgentInstructionsService,
    accessService: () => mockAccessService,
    approvalService: () => mockApprovalService,
    companySkillService: () => mockCompanySkillService,
    budgetService: () => mockBudgetService,
    heartbeatService: () => mockHeartbeatService,
    issueApprovalService: () => mockIssueApprovalService,
    issueService: () => mockIssueService,
    logActivity: mockLogActivity,
    projectService: () => mockProjectService,
    secretService: () => mockSecretService,
    syncInstructionsBundleConfigFromFilePath: mockSyncInstructionsBundleConfigFromFilePath,
    workspaceOperationService: () => mockWorkspaceOperationService,
  }));

  vi.doMock("../adapters/index.js", () => ({
    findServerAdapter: vi.fn(() => mockAdapter),
    findActiveServerAdapter: vi.fn(() => mockAdapter),
    listAdapterModels: vi.fn(),
    detectAdapterModel: vi.fn(),
  }));
}

function createDb(requireBoardApprovalForNewAgents = false) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [
          {
            id: "company-1",
            requireBoardApprovalForNewAgents,
          },
        ]),
      })),
    })),
  };
}

function createDbWithProjectWorkspace(workspace: Record<string, unknown> | null) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => workspace ? [workspace] : []),
      })),
    })),
  };
}

async function createApp(db: Record<string, unknown> = createDb()) {
  const [{ agentRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/agents.js")>("../routes/agents.js"),
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
  app.use("/api", agentRoutes(db as any));
  app.use(errorHandler);
  return app;
}

function makeAgent(adapterType: string) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    name: "Agent",
    role: "engineer",
    title: "Engineer",
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType,
    adapterConfig: {},
    runtimeConfig: {},
    permissions: null,
    updatedAt: new Date(),
  };
}

describe("agent skill routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/agents.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    mockSyncInstructionsBundleConfigFromFilePath.mockImplementation((_agent, config) => config);
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockAgentService.resolveByReference.mockResolvedValue({
      ambiguous: false,
      agent: makeAgent("claude_local"),
    });
    mockSecretService.resolveAdapterConfigForRuntime.mockResolvedValue({ config: { env: {} } });
    mockCompanySkillService.listRuntimeSkillEntries.mockResolvedValue([
      {
        key: "paperclipai/paperclip/paperclip",
        runtimeName: "paperclip",
        source: "/tmp/paperclip",
        required: true,
        requiredReason: "required",
      },
    ]);
    mockCompanySkillService.resolveRequestedSkillKeys.mockImplementation(
      async (_companyId: string, requested: string[]) =>
        requested.map((value) =>
          value === "paperclip"
            ? "paperclipai/paperclip/paperclip"
            : value,
        ),
    );
    mockAdapter.listSkills.mockResolvedValue({
      adapterType: "claude_local",
      supported: true,
      mode: "ephemeral",
      desiredSkills: ["paperclipai/paperclip/paperclip"],
      entries: [],
      warnings: [],
    });
    mockAdapter.syncSkills.mockResolvedValue({
      adapterType: "claude_local",
      supported: true,
      mode: "ephemeral",
      desiredSkills: ["paperclipai/paperclip/paperclip"],
      entries: [],
      warnings: [],
    });
    mockAgentService.update.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      ...((await mockAgentService.getById(id)) ?? makeAgent("claude_local")),
      adapterConfig: patch.adapterConfig ?? {},
      ...patch,
    }));
    mockAgentService.create.mockImplementation(async (_companyId: string, input: Record<string, unknown>) => ({
      ...makeAgent(String(input.adapterType ?? "claude_local")),
      ...input,
      adapterConfig: input.adapterConfig ?? {},
      runtimeConfig: input.runtimeConfig ?? {},
      budgetMonthlyCents: Number(input.budgetMonthlyCents ?? 0),
      permissions: null,
    }));
    mockApprovalService.create.mockImplementation(async (_companyId: string, input: Record<string, unknown>) => ({
      id: "approval-1",
      companyId: "company-1",
      type: "hire_agent",
      status: "pending",
      payload: input.payload ?? {},
    }));
    mockAgentInstructionsService.materializeManagedBundle.mockImplementation(
      async (agent: Record<string, unknown>, files: Record<string, string>) => ({
        bundle: null,
        adapterConfig: {
          ...((agent.adapterConfig as Record<string, unknown> | undefined) ?? {}),
          instructionsBundleMode: "managed",
          instructionsRootPath: `/tmp/${String(agent.id)}/instructions`,
          instructionsEntryFile: "AGENTS.md",
          instructionsFilePath: `/tmp/${String(agent.id)}/instructions/AGENTS.md`,
          promptTemplate: files["AGENTS.md"] ?? "",
        },
      }),
    );
    mockLogActivity.mockResolvedValue(undefined);
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(true);
    mockAccessService.getMembership.mockResolvedValue(null);
    mockAccessService.listPrincipalGrants.mockResolvedValue([]);
    mockAccessService.ensureMembership.mockResolvedValue(undefined);
    mockAccessService.setPrincipalPermission.mockResolvedValue(undefined);
    mockIssueService.getById.mockResolvedValue(null);
    mockIssueService.create.mockImplementation(async (_companyId: string, input: Record<string, unknown>) => ({
      id: "issue-1",
      companyId: "company-1",
      identifier: "PCL-1",
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockIssueService.update.mockResolvedValue(null);
    mockAgentInstructionsService.getBundle.mockResolvedValue({
      agentId: "11111111-1111-4111-8111-111111111111",
      companyId: "company-1",
      mode: "managed",
      rootPath: "/tmp/11111111-1111-4111-8111-111111111111/instructions",
      managedRootPath: "/tmp/11111111-1111-4111-8111-111111111111/instructions",
      entryFile: "AGENTS.md",
      resolvedEntryPath: "/tmp/11111111-1111-4111-8111-111111111111/instructions/AGENTS.md",
      editable: true,
      warnings: [],
      legacyPromptTemplateActive: false,
      legacyBootstrapPromptTemplateActive: false,
      files: [{ path: "AGENTS.md", size: 10, language: "markdown", markdown: true, isEntryFile: true, editable: true, deprecated: false, virtual: false }],
    });
    mockHeartbeatService.wakeup.mockResolvedValue({ id: "run-1" });
    mockProjectService.getById.mockResolvedValue(null);
  });

  it("skips runtime materialization when listing Claude skills", async () => {
    mockAgentService.getById.mockResolvedValue(makeAgent("claude_local"));

    const res = await request(await createApp())
      .get("/api/agents/11111111-1111-4111-8111-111111111111/skills?companyId=company-1");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockAdapter.listSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: "claude_local",
        config: expect.objectContaining({
          paperclipRuntimeSkills: expect.any(Array),
        }),
      }),
    );
  }, 10_000);

  it("skips runtime materialization when listing Codex skills", async () => {
    mockAgentService.getById.mockResolvedValue(makeAgent("codex_local"));
    mockAdapter.listSkills.mockResolvedValue({
      adapterType: "codex_local",
      supported: true,
      mode: "ephemeral",
      desiredSkills: ["paperclipai/paperclip/paperclip"],
      entries: [],
      warnings: [],
    });

    const res = await request(await createApp())
      .get("/api/agents/11111111-1111-4111-8111-111111111111/skills?companyId=company-1");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("keeps runtime materialization for persistent skill adapters", async () => {
    mockAgentService.getById.mockResolvedValue(makeAgent("cursor"));
    mockAdapter.listSkills.mockResolvedValue({
      adapterType: "cursor",
      supported: true,
      mode: "persistent",
      desiredSkills: ["paperclipai/paperclip/paperclip"],
      entries: [],
      warnings: [],
    });

    const res = await request(await createApp())
      .get("/api/agents/11111111-1111-4111-8111-111111111111/skills?companyId=company-1");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it("skips runtime materialization when syncing Claude skills", async () => {
    mockAgentService.getById.mockResolvedValue(makeAgent("claude_local"));

    const res = await request(await createApp())
      .post("/api/agents/11111111-1111-4111-8111-111111111111/skills/sync?companyId=company-1")
      .send({ desiredSkills: ["paperclipai/paperclip/paperclip"] });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockAdapter.syncSkills).toHaveBeenCalled();
  });

  it("canonicalizes desired skill references before syncing", async () => {
    mockAgentService.getById.mockResolvedValue(makeAgent("claude_local"));

    const res = await request(await createApp())
      .post("/api/agents/11111111-1111-4111-8111-111111111111/skills/sync?companyId=company-1")
      .send({ desiredSkills: ["paperclip"] });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mockAgentService.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          paperclipSkillSync: expect.objectContaining({
            desiredSkills: ["paperclipai/paperclip/paperclip"],
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it("persists canonical desired skills when creating an agent directly", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/agents")
      .send({
        name: "QA Agent",
        role: "engineer",
        adapterType: "claude_local",
        desiredSkills: ["paperclip"],
        adapterConfig: {},
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockAgentService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          paperclipSkillSync: expect.objectContaining({
            desiredSkills: ["paperclipai/paperclip/paperclip"],
          }),
        }),
      }),
    );
    expect(mockTrackAgentCreated).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agentId: "11111111-1111-4111-8111-111111111111",
        agentRole: "engineer",
      }),
    );
  });

  it("materializes a managed AGENTS.md for directly created local agents", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/agents")
      .send({
        name: "QA Agent",
        role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {
          promptTemplate: "You are QA.",
        },
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockAgentInstructionsService.materializeManagedBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        adapterType: "claude_local",
      }),
      expect.objectContaining({
        "AGENTS.md": expect.stringContaining("You are QA."),
      }),
      { entryFile: "AGENTS.md", replaceExisting: false },
    );
    const files = mockAgentInstructionsService.materializeManagedBundle.mock.calls.at(-1)?.[1] as
      | Record<string, string>
      | undefined;
    expect(files?.["AGENTS.md"]).toContain("## Custom role directives");
    expect(files?.["AGENTS.md"]).toContain("Keep the work moving until it's done.");
    expect(mockAgentService.update).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          instructionsBundleMode: "managed",
          instructionsEntryFile: "AGENTS.md",
          instructionsFilePath: "/tmp/11111111-1111-4111-8111-111111111111/instructions/AGENTS.md",
        }),
      }),
    );
    expect(mockAgentService.update.mock.calls.at(-1)?.[1]).not.toMatchObject({
      adapterConfig: expect.objectContaining({
        promptTemplate: expect.anything(),
      }),
    });
  });

  it("materializes the bundled CEO instruction set for default CEO agents", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/agents")
      .send({
        name: "CEO",
        role: "ceo",
        adapterType: "claude_local",
        adapterConfig: {},
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockAgentInstructionsService.materializeManagedBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        role: "ceo",
        adapterType: "claude_local",
      }),
      expect.objectContaining({
        "AGENTS.md": expect.stringContaining("You are the CEO."),
        "HEARTBEAT.md": expect.stringContaining("CEO Heartbeat Checklist"),
        "SOUL.md": expect.stringContaining("CEO Persona"),
        "TOOLS.md": expect.stringContaining("# Tools"),
      }),
      { entryFile: "AGENTS.md", replaceExisting: false },
    );
  });

  it("materializes the bundled default instruction set for non-CEO agents with no prompt template", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/agents")
      .send({
        name: "Engineer",
        role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    await vi.waitFor(() => {
      expect(mockAgentInstructionsService.materializeManagedBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "11111111-1111-4111-8111-111111111111",
          role: "engineer",
          adapterType: "claude_local",
        }),
        expect.objectContaining({
          "AGENTS.md": expect.stringContaining("Keep the work moving until it's done."),
        }),
        { entryFile: "AGENTS.md", replaceExisting: false },
      );
    });
  });

  it("persists required bundled skills when creating agents without explicit desired skills", async () => {
    const res = await request(await createApp())
      .post("/api/companies/company-1/agents")
      .send({
        name: "Engineer",
        role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });

    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(mockSecretService.normalizeAdapterConfigForPersistence).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        paperclipSkillSync: expect.objectContaining({
          desiredSkills: ["paperclipai/paperclip/paperclip"],
        }),
      }),
      expect.any(Object),
    );
  });

  it("includes canonical desired skills in hire approvals", async () => {
    const db = createDb(true);

    const res = await request(await createApp(db))
      .post("/api/companies/company-1/agent-hires")
      .send({
        name: "QA Agent",
        role: "engineer",
        adapterType: "claude_local",
        desiredSkills: ["paperclip"],
        adapterConfig: {},
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        payload: expect.objectContaining({
          desiredSkills: ["paperclipai/paperclip/paperclip"],
          requestedConfigurationSnapshot: expect.objectContaining({
            desiredSkills: ["paperclipai/paperclip/paperclip"],
          }),
        }),
      }),
    );
  });

  it("includes required bundled skills in hire approvals without explicit desired skills", async () => {
    const res = await request(await createApp(createDb(true)))
      .post("/api/companies/company-1/agent-hires")
      .send({
        name: "QA Agent",
        role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {},
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        payload: expect.objectContaining({
          desiredSkills: ["paperclipai/paperclip/paperclip"],
          requestedConfigurationSnapshot: expect.objectContaining({
            desiredSkills: ["paperclipai/paperclip/paperclip"],
          }),
        }),
      }),
    );
  });

  it("creates and wakes an operating pack audit issue for an agent", async () => {
    mockAgentService.getById.mockResolvedValue({
      ...makeAgent("claude_local"),
      role: "ceo",
      name: "CEO",
      adapterConfig: {},
    });

    const res = await request(await createApp())
      .post("/api/agents/11111111-1111-4111-8111-111111111111/operating-pack-audit-issue?companyId=company-1")
      .send({ scope: "agent_operating_pack" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Audit and refresh CEO operating pack",
        assigneeAgentId: "11111111-1111-4111-8111-111111111111",
        status: "todo",
        description: expect.stringContaining("Missing expected files"),
      }),
    );
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        reason: "operating_pack_audit_requested",
        payload: expect.objectContaining({ issueId: "issue-1" }),
      }),
    );
    expect(res.body.audit.missingFiles).toContain("OPERATING_MODELS.md");
    expect(res.body.audit.missingRequiredSkills).toEqual([]);
    expect(mockAgentService.update).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        adapterConfig: expect.objectContaining({
          paperclipSkillSync: expect.objectContaining({
            desiredSkills: ["paperclipai/paperclip/paperclip"],
          }),
        }),
      }),
      expect.objectContaining({
        recordRevision: expect.objectContaining({ source: "required_runtime_skills_refresh" }),
      }),
    );
  });

  it("rejects operating pack audit issues linked to another company project", async () => {
    mockAgentService.getById.mockResolvedValue({
      ...makeAgent("claude_local"),
      role: "ceo",
      name: "CEO",
      adapterConfig: {},
    });
    mockProjectService.getById.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      companyId: "other-company",
    });

    const res = await request(await createApp())
      .post("/api/agents/11111111-1111-4111-8111-111111111111/operating-pack-audit-issue?companyId=company-1")
      .send({
        projectId: "22222222-2222-4222-8222-222222222222",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();
  });

  it("rejects operating pack audit issues linked to a workspace outside the requested project", async () => {
    mockAgentService.getById.mockResolvedValue({
      ...makeAgent("claude_local"),
      role: "ceo",
      name: "CEO",
      adapterConfig: {},
    });
    mockProjectService.getById.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      companyId: "company-1",
    });
    const db = createDbWithProjectWorkspace({
      id: "33333333-3333-4333-8333-333333333333",
      companyId: "company-1",
      projectId: "44444444-4444-4444-8444-444444444444",
    });

    const res = await request(await createApp(db))
      .post("/api/agents/11111111-1111-4111-8111-111111111111/operating-pack-audit-issue?companyId=company-1")
      .send({
        projectId: "22222222-2222-4222-8222-222222222222",
        projectWorkspaceId: "33333333-3333-4333-8333-333333333333",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(mockIssueService.create).not.toHaveBeenCalled();
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();
  });

  it("uses managed AGENTS config in hire approval payloads", async () => {
    const res = await request(await createApp(createDb(true)))
      .post("/api/companies/company-1/agent-hires")
      .send({
        name: "QA Agent",
        role: "engineer",
        adapterType: "claude_local",
        adapterConfig: {
          promptTemplate: "You are QA.",
        },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        payload: expect.objectContaining({
          adapterConfig: expect.objectContaining({
            instructionsBundleMode: "managed",
            instructionsEntryFile: "AGENTS.md",
            instructionsFilePath: "/tmp/11111111-1111-4111-8111-111111111111/instructions/AGENTS.md",
          }),
        }),
      }),
    );
    const approvalInput = mockApprovalService.create.mock.calls.at(-1)?.[1] as
      | { payload?: { adapterConfig?: Record<string, unknown> } }
      | undefined;
    expect(approvalInput?.payload?.adapterConfig?.promptTemplate).toBeUndefined();
    const files = mockAgentInstructionsService.materializeManagedBundle.mock.calls.at(-1)?.[1] as
      | Record<string, string>
      | undefined;
    expect(files?.["AGENTS.md"]).toContain("## Custom role directives");
    expect(files?.["AGENTS.md"]).toContain("You are QA.");
  });

  it("adds a project packet when hiring from an accepted baseline project issue", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "11111111-2222-4333-8444-555555555555",
      companyId: "company-1",
      projectId: "66666666-7777-4888-8999-000000000000",
    });
    mockProjectService.getById.mockResolvedValue({
      id: "66666666-7777-4888-8999-000000000000",
      companyId: "company-1",
      name: "Prop4You Next.js Fullstack",
      operatingContext: {
        baselineStatus: "accepted",
        overviewSummary: "Existing Next.js platform for real-estate operations.",
        stackSummary: ["Next.js", "TypeScript", "PostgreSQL"],
        topRisks: ["Legacy auth flow still needs regression coverage."],
        labelCatalog: [
          {
            name: "frontend",
            description: "UI and interaction work.",
            usageGuidance: "Use for React/Vite surface changes.",
          },
        ],
        canonicalDocs: [
          {
            path: "README.md",
            title: "Repository README",
            reason: "Primary contributor entrypoint.",
          },
        ],
        verificationCommands: ["pnpm test", "pnpm --filter @paperclipai/ui typecheck"],
        ownershipAreas: [
          {
            name: "Frontend",
            paths: ["ui/"],
            summary: "React application surface.",
          },
        ],
        operatingGuidance: [
          "Read the baseline tracking issue before decomposing work.",
        ],
        executiveProjectPacket: {
          projectSummary: "Executive framing for an existing real-estate operations platform.",
          stackSummary: ["Next.js", "TypeScript", "PostgreSQL"],
          docsToReadFirst: ["README.md"],
          topRisks: ["Legacy auth flow still needs regression coverage."],
          topGaps: ["Architecture decision records are still thin."],
          operatingGuidance: ["Validate baseline issue context before delegating."],
          hiringSignals: ["cto"],
        },
        technicalProjectPacket: {
          projectSummary: "Technical framing for an existing Next.js and TypeScript codebase.",
          stackSignals: ["Next.js", "TypeScript", "PostgreSQL"],
          canonicalDocs: ["README.md"],
          verificationCommands: ["pnpm test", "pnpm --filter @paperclipai/ui typecheck"],
          ownershipAreas: [
            {
              name: "Frontend",
              paths: ["ui/"],
              summary: "React application surface.",
            },
          ],
          labelCatalog: [
            {
              name: "frontend",
              description: "UI and interaction work.",
              usageGuidance: "Use for React/Vite surface changes.",
            },
          ],
          issueGuidance: [
            "Use the baseline issue as the canonical project context when planning work.",
          ],
        },
        descriptionSuggestion: "Paperclip deployment for Prop4You real-estate workflows.",
        descriptionSource: "baseline",
        suggestedGoals: [],
        baselineTrackingIssueId: "tracking-1",
        baselineTrackingIssueIdentifier: "P4Y-1",
        baselineAcceptedAt: "2026-04-23T12:00:00.000Z",
      },
    });

    const res = await request(await createApp())
      .post("/api/companies/company-1/agent-hires")
      .send({
        name: "CTO",
        role: "cto",
        adapterType: "claude_local",
        adapterConfig: {},
        sourceIssueIds: ["11111111-2222-4333-8444-555555555555"],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockAgentInstructionsService.materializeManagedBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "cto",
        adapterType: "claude_local",
      }),
      expect.objectContaining({
        "AGENTS.md": expect.stringContaining("PROJECT_PACKET.md"),
        "PROJECT_PACKET.md": expect.stringContaining("Prop4You Next.js Fullstack"),
      }),
      { entryFile: "AGENTS.md", replaceExisting: false },
    );
    const files = mockAgentInstructionsService.materializeManagedBundle.mock.calls.at(-1)?.[1] as
      | Record<string, string>
      | undefined;
    expect(files?.["PROJECT_PACKET.md"]).toContain("## Verification commands");
    expect(files?.["PROJECT_PACKET.md"]).toContain("## Ownership areas");
    expect(files?.["PROJECT_PACKET.md"]).toContain("Baseline issue: P4Y-1");
  });

  it("assigns staffing hire source issues to the reviewer when a hire approval is created", async () => {
    const sourceIssueId = "11111111-2222-4333-8444-555555555555";
    const ceoAgentId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
    mockIssueService.getById.mockResolvedValue({
      id: sourceIssueId,
      companyId: "company-1",
      projectId: "66666666-7777-4888-8999-000000000000",
      originKind: "staffing_hiring",
      status: "backlog",
      assigneeAgentId: null,
    });

    const res = await request(await createApp(createDb(true)))
      .post("/api/companies/company-1/agent-hires")
      .send({
        name: "CTO",
        role: "cto",
        reportsTo: ceoAgentId,
        adapterType: "claude_local",
        adapterConfig: {},
        sourceIssueIds: [sourceIssueId],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockIssueApprovalService.linkManyForApproval).toHaveBeenCalledWith(
      "approval-1",
      [sourceIssueId],
      { agentId: null, userId: "local-board" },
    );
    expect(mockIssueService.update).toHaveBeenCalledWith(sourceIssueId, {
      status: "in_review",
      assigneeAgentId: ceoAgentId,
      assigneeUserId: null,
      actorAgentId: null,
      actorUserId: "local-board",
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "issue.staffing_approval_requested",
        entityType: "issue",
        entityId: sourceIssueId,
        details: {
          approvalId: "approval-1",
          reviewerAgentId: ceoAgentId,
        },
      }),
    );
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(ceoAgentId, expect.objectContaining({
      source: "assignment",
      reason: "staffing_approval_requested",
      payload: {
        issueId: sourceIssueId,
        approvalId: "approval-1",
      },
      contextSnapshot: expect.objectContaining({
        issueId: sourceIssueId,
        approvalId: "approval-1",
        wakeReason: "staffing_approval_requested",
        forceFreshSession: true,
      }),
    }));
  });

  it("still wakes the reviewer when a staffing source issue is already assigned", async () => {
    const sourceIssueId = "11111111-2222-4333-8444-555555555555";
    const ceoAgentId = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
    mockIssueService.getById.mockResolvedValue({
      id: sourceIssueId,
      companyId: "company-1",
      projectId: "66666666-7777-4888-8999-000000000000",
      originKind: "staffing_hiring",
      status: "in_review",
      assigneeAgentId: ceoAgentId,
    });

    const res = await request(await createApp(createDb(true)))
      .post("/api/companies/company-1/agent-hires")
      .send({
        name: "CTO",
        role: "cto",
        reportsTo: ceoAgentId,
        adapterType: "claude_local",
        adapterConfig: {},
        sourceIssueIds: [sourceIssueId],
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockIssueService.update).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.staffing_approval_requested" }),
    );
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(ceoAgentId, expect.objectContaining({
      source: "assignment",
      reason: "staffing_approval_requested",
      payload: {
        issueId: sourceIssueId,
        approvalId: "approval-1",
      },
    }));
  });
});
