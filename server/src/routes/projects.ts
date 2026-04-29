import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  acceptRepositoryBaselineRequestSchema,
  acceptProjectSuggestedGoalSchema,
  createProjectSchema,
  createProjectWorkspaceSchema,
  createHiringIssueRequestSchema,
  emptyRepositoryDocumentationBaseline,
  findWorkspaceCommandDefinition,
  generateHiringBriefRequestSchema,
  isUuidLike,
  matchWorkspaceRuntimeServiceToCommand,
  applyRepositoryBaselineRecommendationsRequestSchema,
  readRepositoryDocumentationBaselineFromMetadata,
  refreshRepositoryDocumentationBaselineRequestSchema,
  type Issue,
  type AppliedRepositoryBaselineLabelsResult,
  type HiringBriefPreview,
  type IssueLabel,
  type RepositoryDocumentationBaseline,
  type RepositoryBaselineAcceptedGuidance,
  type RepositoryBaselineSuggestedLabel,
  type ProjectIssueSystemGuidance,
  type RefreshRepositoryDocumentationBaselineResponse,
  type ApplyRepositoryBaselineRecommendationsResponse,
  updateProjectSchema,
  updateProjectWorkspaceSchema,
  updateExecutionContractRequestSchema,
  workspaceRuntimeControlTargetSchema,
  writeRepositoryDocumentationBaselineToMetadata,
  markExecutionContextReadyRequestSchema,
} from "@paperclipai/shared";
import { trackProjectCreated } from "@paperclipai/shared/telemetry";
import { validate } from "../middleware/validate.js";
import {
  buildHiringBriefPreview,
  buildHiringIssueCreateInput,
  buildProjectOperatingContextFromBaseline,
  isExecutionContractComplete,
  goalService,
  projectService,
  issueService,
  logActivity,
  secretService,
  workspaceOperationService,
} from "../services/index.js";
import { conflict } from "../errors.js";
import { assertBoard, assertCompanyAccess, assertInstanceAdmin, getActorInfo } from "./authz.js";
import {
  buildWorkspaceRuntimeDesiredStatePatch,
  listConfiguredRuntimeServiceEntries,
  runWorkspaceJobForControl,
  startRuntimeServicesForWorkspaceControl,
  stopRuntimeServicesForProjectWorkspace,
} from "../services/workspace-runtime.js";
import { buildRepositoryDocumentationBaseline } from "../services/repository-baseline.js";
import { getTelemetryClient } from "../telemetry.js";
import { buildRepositoryBaselineTrackingIssueDescription } from "../services/repository-baseline-tracking-issue.js";

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);
  const goalsSvc = goalService(db);
  const issuesSvc = issueService(db);
  const secretsSvc = secretService(db);
  const workspaceOperations = workspaceOperationService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";
  type ProjectRouteProject = NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
  type ProjectRouteWorkspace = ProjectRouteProject["workspaces"][number];
  type ProjectRouteIssue = Awaited<ReturnType<typeof issuesSvc.create>>;

  async function resolveRepositoryBaselineTrackingIssue(input: {
    actorUserId: string | null;
    baseline: RepositoryDocumentationBaseline;
    project: ProjectRouteProject;
    workspace: ProjectRouteWorkspace;
  }): Promise<ProjectRouteIssue | null> {
    const existingIssueId = input.baseline.trackingIssueId?.trim() || null;
    if (existingIssueId) {
      const existing = await issuesSvc.getById(existingIssueId);
      if (
        existing &&
        existing.companyId === input.project.companyId &&
        existing.projectId === input.project.id &&
        existing.projectWorkspaceId === input.workspace.id
      ) {
        return existing;
      }
    }

    return issuesSvc.create(input.project.companyId, {
      projectId: input.project.id,
      projectWorkspaceId: input.workspace.id,
      parentId: null,
      title: `Repository documentation baseline for ${input.project.name}`,
      description: buildRepositoryBaselineTrackingIssueDescription({
        projectName: input.project.name,
        workspaceName: input.workspace.name,
        baseline: input.baseline,
        operatingContext: input.project.operatingContext ?? null,
        issueStatus: "backlog",
        issueAssigneeAgentId: null,
      }),
      status: "backlog",
      priority: "medium",
      assigneeAgentId: null,
      assigneeUserId: null,
      requestDepth: 0,
      createdByAgentId: null,
      createdByUserId: input.actorUserId,
    });
  }

  async function syncRepositoryBaselineTrackingIssue(input: {
    actorUserId: string | null;
    baseline: RepositoryDocumentationBaseline;
    labelIds?: string[];
    project: ProjectRouteProject;
    workspace: ProjectRouteWorkspace;
  }): Promise<ProjectRouteIssue | null> {
    const issueId = input.baseline.trackingIssueId?.trim() || null;
    if (!issueId) return null;

    const existing = await issuesSvc.getById(issueId);
    if (
      !existing ||
      existing.companyId !== input.project.companyId ||
      existing.projectId !== input.project.id ||
      existing.projectWorkspaceId !== input.workspace.id
    ) {
      return null;
    }

    return issuesSvc.update(issueId, {
      description: buildRepositoryBaselineTrackingIssueDescription({
        projectName: input.project.name,
        workspaceName: input.workspace.name,
        baseline: input.baseline,
        operatingContext: input.project.operatingContext ?? null,
        issueStatus: existing.status,
        issueAssigneeAgentId: existing.assigneeAgentId,
      }),
      ...(input.labelIds ? { labelIds: input.labelIds } : {}),
      actorUserId: input.actorUserId,
      actorAgentId: null,
    }) as Promise<ProjectRouteIssue | null>;
  }

  function buildRepositoryBaselineLabelMetadata(input: {
    projectId: string;
    workspaceId: string;
    evidence: string[];
    confidence: RepositoryBaselineSuggestedLabel["confidence"];
  }) {
    return {
      baselineEvidence: input.evidence,
      baselineConfidence: input.confidence,
      baselineProjectId: input.projectId,
      baselineWorkspaceId: input.workspaceId,
    };
  }

  async function applySuggestedRepositoryLabels(input: {
    companyId: string;
    projectId: string;
    workspaceId: string;
    baseline: RepositoryDocumentationBaseline;
    applyLabels: boolean;
  }): Promise<AppliedRepositoryBaselineLabelsResult> {
    const suggestions = input.baseline.recommendations?.labels ?? [];
    if (!input.applyLabels || suggestions.length === 0) {
      return { created: [], existing: [], skipped: suggestions };
    }

    const existingLabels = await issuesSvc.listLabels(input.companyId) as IssueLabel[];
    const existingByName = new Map(existingLabels.map((label) => [label.name.trim().toLowerCase(), label]));
    const created: IssueLabel[] = [];
    const existing: IssueLabel[] = [];

    for (const suggestion of suggestions) {
      const key = suggestion.name.trim().toLowerCase();
      const metadata = buildRepositoryBaselineLabelMetadata({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        evidence: suggestion.evidence,
        confidence: suggestion.confidence,
      });
      const alreadyExisting = existingByName.get(key);
      if (alreadyExisting) {
        const updated = await issuesSvc.updateLabel(alreadyExisting.id, {
          description: alreadyExisting.source === "repository_baseline" || !alreadyExisting.description?.trim()
            ? suggestion.description
            : alreadyExisting.description,
          source: alreadyExisting.source === "system" ? "system" : "repository_baseline",
          metadata: {
            ...(alreadyExisting.metadata && typeof alreadyExisting.metadata === "object" ? alreadyExisting.metadata : {}),
            ...metadata,
          },
        });
        existing.push((updated ?? alreadyExisting) as IssueLabel);
        continue;
      }
      const label = await issuesSvc.createLabel(input.companyId, {
        name: suggestion.name,
        color: suggestion.color,
        description: suggestion.description,
        source: "repository_baseline",
        metadata,
      }) as IssueLabel;
      created.push(label);
      existingByName.set(key, label);
    }

    return { created, existing, skipped: [] };
  }

  function buildAcceptedRepositoryBaselineGuidance(input: {
    baseline: RepositoryDocumentationBaseline;
    acceptedByUserId: string | null;
  }): RepositoryBaselineAcceptedGuidance | null {
    const recommendations = input.baseline.recommendations ?? {
      labels: [],
      issuePolicy: {
        labelUsageGuidance: [],
        parentChildGuidance: [],
        blockingGuidance: [],
        reviewGuidance: [],
        approvalGuidance: [],
      },
      projectDefaults: {
        canonicalDocs: [],
        suggestedVerificationCommands: [],
        ownershipAreas: [],
      },
    };
    return {
      acceptedAt: new Date().toISOString(),
      acceptedByUserId: input.acceptedByUserId,
      labels: recommendations.labels,
      issuePolicy: recommendations.issuePolicy,
      projectDefaults: recommendations.projectDefaults,
    };
  }

  function buildProjectIssueSystemGuidanceFromBaseline(
    acceptedGuidance: RepositoryBaselineAcceptedGuidance | null,
  ): ProjectIssueSystemGuidance | null {
    if (!acceptedGuidance) return null;
    return {
      labelUsageGuidance: acceptedGuidance.issuePolicy.labelUsageGuidance,
      parentChildGuidance: acceptedGuidance.issuePolicy.parentChildGuidance,
      blockingGuidance: acceptedGuidance.issuePolicy.blockingGuidance,
      reviewGuidance: acceptedGuidance.issuePolicy.reviewGuidance,
      approvalGuidance: acceptedGuidance.issuePolicy.approvalGuidance,
      canonicalDocs: acceptedGuidance.projectDefaults.canonicalDocs,
      suggestedVerificationCommands: acceptedGuidance.projectDefaults.suggestedVerificationCommands,
    };
  }

  function mergeRepositoryBaselineRecommendationDecisions(input: {
    existing: RepositoryDocumentationBaseline["recommendationDecisions"];
    next: NonNullable<RepositoryDocumentationBaseline["recommendationDecisions"]>;
  }): NonNullable<RepositoryDocumentationBaseline["recommendationDecisions"]> {
    const byKey = new Map<string, NonNullable<RepositoryDocumentationBaseline["recommendationDecisions"]>[number]>();
    for (const record of input.existing ?? []) {
      byKey.set(`${record.kind}:${record.key}`, record);
    }
    for (const record of input.next) {
      byKey.set(`${record.kind}:${record.key}`, record);
    }
    return [...byKey.values()];
  }

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      assertCompanyAccess(req, requestedCompanyId);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    return resolved.project?.id ?? rawId;
  }

  function requiresWorkspaceCommandAdmin(input: unknown): boolean {
    if (!input || typeof input !== "object") return false;
    const policy = input as {
      executionWorkspacePolicy?: {
        workspaceStrategy?: {
          provisionCommand?: unknown;
          teardownCommand?: unknown;
        } | null;
      } | null;
    };
    const strategy = policy.executionWorkspacePolicy?.workspaceStrategy;
    if (!strategy) return false;

    const hasProvisionCommand =
      typeof strategy.provisionCommand === "string" && strategy.provisionCommand.trim().length > 0;
    const hasTeardownCommand =
      typeof strategy.teardownCommand === "string" && strategy.teardownCommand.trim().length > 0;
    return hasProvisionCommand || hasTeardownCommand;
  }

  async function getProjectWorkspaceForRequest(req: Request, res: Response) {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return null;
    }
    assertCompanyAccess(req, project.companyId);

    const workspace = project.workspaces.find((entry) => entry.id === workspaceId) ?? null;
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return null;
    }

    return { project, workspace };
  }

  function buildEffectiveProjectOperatingContext(input: {
    project: ProjectRouteProject;
    workspace: ProjectRouteWorkspace;
  }) {
    const workspaceBaseline = readRepositoryDocumentationBaselineFromMetadata(input.workspace.metadata);
    if (!input.project.operatingContext) return null;
    return {
      ...input.project.operatingContext,
      baselineTrackingIssueId:
        input.project.operatingContext.baselineTrackingIssueId
        ?? workspaceBaseline?.trackingIssueId
        ?? null,
      baselineTrackingIssueIdentifier:
        input.project.operatingContext.baselineTrackingIssueIdentifier
        ?? workspaceBaseline?.trackingIssueIdentifier
        ?? null,
    };
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    res.json(project);
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (requiresWorkspaceCommandAdmin(req.body)) {
      assertInstanceAdmin(req);
    }
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
    };

    const { workspace, ...projectData } = req.body as CreateProjectPayload;
    if (projectData.env !== undefined) {
      projectData.env = await secretsSvc.normalizeEnvBindingsForPersistence(
        companyId,
        projectData.env,
        { strictMode: strictSecretsMode, fieldPath: "env" },
      );
    }
    const project = await svc.create(companyId, projectData);
    let createdWorkspaceId: string | null = null;
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace);
      if (!createdWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }
      createdWorkspaceId = createdWorkspace.id;
    }
    const hydratedProject = workspace ? await svc.getById(project.id) : project;

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
        envKeys: project.env ? Object.keys(project.env).sort() : [],
      },
    });
    const telemetryClient = getTelemetryClient();
    if (telemetryClient) {
      trackProjectCreated(telemetryClient);
    }
    res.status(201).json(hydratedProject ?? project);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    if (requiresWorkspaceCommandAdmin(req.body)) {
      assertInstanceAdmin(req);
    }
    const body = { ...req.body };
    if (typeof body.archivedAt === "string") {
      body.archivedAt = new Date(body.archivedAt);
    }
    if (body.env !== undefined) {
      body.env = await secretsSvc.normalizeEnvBindingsForPersistence(existing.companyId, body.env, {
        strictMode: strictSecretsMode,
        fieldPath: "env",
      });
    }
    const project = await svc.update(id, body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: {
        changedKeys: Object.keys(req.body).sort(),
        envKeys:
          body.env && typeof body.env === "object" && !Array.isArray(body.env)
            ? Object.keys(body.env as Record<string, unknown>).sort()
            : undefined,
      },
    });

    res.json(project);
  });

  router.post(
    "/projects/:id/operating-context/suggested-goals/:key/accept",
    validate(acceptProjectSuggestedGoalSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const key = String(req.params.key ?? "").trim();
      const project = await svc.getById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, project.companyId);

      const operatingContext = project.operatingContext;
      if (!operatingContext) {
        res.status(409).json({ error: "Project has no promoted operating context" });
        return;
      }
      const suggestion = operatingContext.suggestedGoals.find((entry) => entry.key === key) ?? null;
      if (!suggestion) {
        res.status(404).json({ error: "Suggested goal not found" });
        return;
      }
      if (suggestion.status === "accepted" && suggestion.acceptedGoalId) {
        res.status(409).json({ error: "Suggested goal already accepted" });
        return;
      }

      const body = acceptProjectSuggestedGoalSchema.parse(req.body ?? {});
      const goal = await goalsSvc.create(project.companyId, {
        title: body.title?.trim() || suggestion.title,
        description: body.description?.trim() || suggestion.description,
        level: "team",
        status: "planned",
        parentId: null,
        ownerAgentId: null,
      });

      const updatedOperatingContext = {
        ...operatingContext,
        suggestedGoals: operatingContext.suggestedGoals.map((entry) =>
          entry.key === key
            ? {
                ...entry,
                title: body.title?.trim() || entry.title,
                description: body.description?.trim() || entry.description,
                status: "accepted" as const,
                acceptedGoalId: goal.id,
              }
            : entry,
        ),
      };

      const updated = await svc.update(id, {
        goalIds: [...new Set([...(project.goalIds ?? []), goal.id])],
        operatingContext: updatedOperatingContext as unknown as Record<string, unknown>,
      });
      if (!updated) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.operating_context_suggested_goal_accepted",
        entityType: "project",
        entityId: project.id,
        details: {
          key,
          goalId: goal.id,
          goalTitle: goal.title,
        },
      });

      res.json(updated);
    },
  );

  router.post("/projects/:id/operating-context/suggested-goals/:key/reject", async (req, res) => {
    const id = req.params.id as string;
    const key = String(req.params.key ?? "").trim();
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);

    const operatingContext = project.operatingContext;
    if (!operatingContext) {
      res.status(409).json({ error: "Project has no promoted operating context" });
      return;
    }
    const suggestion = operatingContext.suggestedGoals.find((entry) => entry.key === key) ?? null;
    if (!suggestion) {
      res.status(404).json({ error: "Suggested goal not found" });
      return;
    }
    if (suggestion.status === "accepted") {
      res.status(409).json({ error: "Accepted suggested goals cannot be rejected" });
      return;
    }

    const updatedOperatingContext = {
      ...operatingContext,
      suggestedGoals: operatingContext.suggestedGoals.map((entry) =>
        entry.key === key
          ? {
              ...entry,
              status: "rejected" as const,
            }
          : entry,
      ),
    };
    const updated = await svc.update(id, {
      operatingContext: updatedOperatingContext as unknown as Record<string, unknown>,
    });
    if (!updated) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.operating_context_suggested_goal_rejected",
      entityType: "project",
      entityId: project.id,
      details: { key },
    });

    res.json(updated);
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  router.get("/projects/:id/workspaces/:workspaceId/repository-baseline", async (req, res) => {
    const resolved = await getProjectWorkspaceForRequest(req, res);
    if (!resolved) return;

    const baseline =
      readRepositoryDocumentationBaselineFromMetadata(resolved.workspace.metadata)
      ?? emptyRepositoryDocumentationBaseline();
    const response: RefreshRepositoryDocumentationBaselineResponse = {
      baseline,
      workspace: resolved.workspace,
    };
    res.json(response);
  });

  router.post("/projects/:id/workspaces/:workspaceId/repository-baseline", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const resolved = await getProjectWorkspaceForRequest(req, res);
    if (!resolved) return;
    assertBoard(req);
    const { project, workspace: currentWorkspace } = resolved;
    const request = refreshRepositoryDocumentationBaselineRequestSchema.parse(req.body ?? {});
    const existingBaseline = readRepositoryDocumentationBaselineFromMetadata(currentWorkspace.metadata);

    const scannedBaseline = await buildRepositoryDocumentationBaseline({
      cwd: currentWorkspace.cwd,
      repoUrl: currentWorkspace.repoUrl,
      repoRef: currentWorkspace.repoRef,
      defaultRef: currentWorkspace.defaultRef,
    }, {
      runAnalyzer: request.runAnalyzer,
    });
    let baseline: RepositoryDocumentationBaseline = {
      ...scannedBaseline,
      acceptedGuidance: existingBaseline?.acceptedGuidance ?? null,
      recommendationDecisions: existingBaseline?.recommendationDecisions ?? [],
      trackingIssueId: existingBaseline?.trackingIssueId ?? null,
      trackingIssueIdentifier: existingBaseline?.trackingIssueIdentifier ?? null,
    };
    let trackingIssue: ProjectRouteIssue | null = null;
    const actor = getActorInfo(req);

    if (request.createTrackingIssue) {
      trackingIssue = await resolveRepositoryBaselineTrackingIssue({
        actorUserId: actor.actorType === "user" ? actor.actorId : null,
        baseline,
        project,
        workspace: currentWorkspace,
      });
      if (trackingIssue) {
        baseline = {
          ...baseline,
          trackingIssueId: trackingIssue.id,
          trackingIssueIdentifier: trackingIssue.identifier ?? null,
        };
      }
    }
    if (baseline.trackingIssueId) {
      trackingIssue = await syncRepositoryBaselineTrackingIssue({
        actorUserId: actor.actorType === "user" ? actor.actorId : null,
        baseline,
        project,
        workspace: currentWorkspace,
      }) ?? trackingIssue;
    }

    const workspace = await svc.updateWorkspace(id, workspaceId, {
      metadata: writeRepositoryDocumentationBaselineToMetadata({
        metadata: currentWorkspace.metadata,
        baseline,
      }),
    });
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_repository_baseline_refreshed",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        status: baseline.status,
        documentationFileCount: baseline.documentationFiles.length,
        stack: baseline.stack,
        analyzerStatus: baseline.analysis?.status ?? null,
      },
    });
    if (trackingIssue) {
      const linkedIssue = trackingIssue;
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_repository_baseline_tracking_issue_linked",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          issueId: linkedIssue.id,
          issueIdentifier: linkedIssue.identifier,
        },
      });
    }

    const response: RefreshRepositoryDocumentationBaselineResponse = {
      baseline,
      workspace,
      trackingIssue: trackingIssue as Issue | null,
    };
    res.json(response);
  });

  router.post("/projects/:id/workspaces/:workspaceId/repository-baseline/apply-recommendations", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const resolved = await getProjectWorkspaceForRequest(req, res);
    if (!resolved) return;
    assertBoard(req);

    const { project, workspace: currentWorkspace } = resolved;
    const request = applyRepositoryBaselineRecommendationsRequestSchema.parse(req.body ?? {});
    const existingBaseline =
      readRepositoryDocumentationBaselineFromMetadata(currentWorkspace.metadata)
      ?? emptyRepositoryDocumentationBaseline();
    const actor = getActorInfo(req);
    const labelResult = await applySuggestedRepositoryLabels({
      companyId: project.companyId,
      projectId: project.id,
      workspaceId: currentWorkspace.id,
      baseline: existingBaseline,
      applyLabels: request.applyLabels,
    });

    const acceptedGuidance = request.acceptIssueGuidance
      ? buildAcceptedRepositoryBaselineGuidance({
          baseline: existingBaseline,
          acceptedByUserId: actor.actorType === "user" ? actor.actorId : null,
        })
      : existingBaseline.acceptedGuidance ?? null;

    const now = new Date().toISOString();
    const recommendationDecisions = mergeRepositoryBaselineRecommendationDecisions({
      existing: existingBaseline.recommendationDecisions ?? [],
      next: [
        ...(request.applyLabels
          ? (existingBaseline.recommendations?.labels ?? []).map((label) => ({
              kind: "label" as const,
              key: label.name,
              decision: "accepted" as const,
              decidedAt: now,
            }))
          : []),
        ...(request.acceptIssueGuidance
          ? [
              {
                kind: "issue_policy" as const,
                key: "repository-baseline-issue-policy",
                decision: "accepted" as const,
                decidedAt: now,
              },
              {
                kind: "project_default" as const,
                key: "repository-baseline-project-defaults",
                decision: "accepted" as const,
                decidedAt: now,
              },
            ]
          : []),
      ],
    });

    const baseline: RepositoryDocumentationBaseline = {
      ...existingBaseline,
      acceptedGuidance,
      recommendationDecisions,
    };
    const workspace = await svc.updateWorkspace(id, workspaceId, {
      metadata: writeRepositoryDocumentationBaselineToMetadata({
        metadata: currentWorkspace.metadata,
        baseline,
      }),
    });
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }
    const projectIssueSystemGuidance = request.acceptIssueGuidance
      ? buildProjectIssueSystemGuidanceFromBaseline(acceptedGuidance)
      : null;
    const derivedOperatingContext = request.acceptIssueGuidance
      ? buildProjectOperatingContextFromBaseline({
          baseline,
          acceptedGuidance,
          issueSystemGuidance: projectIssueSystemGuidance,
          projectDescription: project.description,
          baselineStatus: "available",
          executionReadiness: "unknown",
        })
      : null;
    const operatingContext = derivedOperatingContext
      ? {
          ...derivedOperatingContext,
          baselineStatus: "available" as const,
          baselineAcceptedAt: null,
          executionReadiness: "unknown" as const,
          executionReadinessUpdatedAt: null,
        }
      : null;
    if (projectIssueSystemGuidance || operatingContext) {
      await svc.update(id, {
        ...(projectIssueSystemGuidance
          ? { issueSystemGuidance: projectIssueSystemGuidance as unknown as Record<string, unknown> }
          : {}),
        ...(operatingContext
          ? { operatingContext: operatingContext as unknown as Record<string, unknown> }
          : {}),
      });
    }
    const trackingIssueLabels = [...labelResult.created, ...labelResult.existing]
      .filter((label) => label.name.trim().toLowerCase() === "docs")
      .map((label) => label.id);
    await syncRepositoryBaselineTrackingIssue({
      actorUserId: actor.actorType === "user" ? actor.actorId : null,
      baseline,
      labelIds: trackingIssueLabels.length > 0 ? trackingIssueLabels : undefined,
      project,
      workspace: currentWorkspace,
    });

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_repository_baseline_recommendations_applied",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        createdLabelCount: labelResult.created.length,
        existingLabelCount: labelResult.existing.length,
        acceptedIssueGuidance: Boolean(request.acceptIssueGuidance),
      },
    });

    const response: ApplyRepositoryBaselineRecommendationsResponse = {
      baseline,
      workspace,
      labels: labelResult,
    };
    res.json(response);
  });

  router.post(
    "/projects/:id/workspaces/:workspaceId/repository-baseline/accept",
    validate(acceptRepositoryBaselineRequestSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const resolved = await getProjectWorkspaceForRequest(req, res);
      if (!resolved) return;
      assertBoard(req);

      const { project, workspace: currentWorkspace } = resolved;
      const request = req.body as { acceptIssueGuidance: boolean };
      const existingBaseline =
        readRepositoryDocumentationBaselineFromMetadata(currentWorkspace.metadata)
        ?? emptyRepositoryDocumentationBaseline();
      const actor = getActorInfo(req);
      const acceptedGuidance = request.acceptIssueGuidance
        ? buildAcceptedRepositoryBaselineGuidance({
            baseline: existingBaseline,
            acceptedByUserId: actor.actorType === "user" ? actor.actorId : null,
          })
        : existingBaseline.acceptedGuidance ?? null;
      if (!acceptedGuidance) {
        res.status(409).json({ error: "Paperclip could not derive accepted guidance from this baseline." });
        return;
      }

      const baseline: RepositoryDocumentationBaseline = {
        ...existingBaseline,
        acceptedGuidance,
      };
      const workspace = await svc.updateWorkspace(id, workspaceId, {
        metadata: writeRepositoryDocumentationBaselineToMetadata({
          metadata: currentWorkspace.metadata,
          baseline,
        }),
      });
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const projectIssueSystemGuidance = buildProjectIssueSystemGuidanceFromBaseline(acceptedGuidance);
      const derivedOperatingContext = buildProjectOperatingContextFromBaseline({
        baseline,
        acceptedGuidance,
        issueSystemGuidance: projectIssueSystemGuidance,
        projectDescription: project.description,
        baselineStatus: "accepted",
        executionReadiness: "needs_operator_contract",
      });
      const operatingContext = derivedOperatingContext
        ? {
            ...derivedOperatingContext,
            baselineStatus: "accepted" as const,
            baselineAcceptedAt: acceptedGuidance.acceptedAt,
            executionReadiness: "needs_operator_contract" as const,
            executionReadinessUpdatedAt: acceptedGuidance.acceptedAt,
          }
        : null;
      if (!operatingContext) {
        res.status(422).json({ error: "Paperclip could not build accepted repository context." });
        return;
      }

      await svc.update(id, {
        issueSystemGuidance: projectIssueSystemGuidance as unknown as Record<string, unknown>,
        operatingContext: operatingContext as unknown as Record<string, unknown>,
      });

      await syncRepositoryBaselineTrackingIssue({
        actorUserId: actor.actorType === "user" ? actor.actorId : null,
        baseline,
        project: {
          ...project,
          issueSystemGuidance: projectIssueSystemGuidance,
          operatingContext,
        },
        workspace: currentWorkspace,
      });

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_repository_context_accepted",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          baselineTrackingIssueId: baseline.trackingIssueId ?? null,
          executionReadiness: operatingContext.executionReadiness ?? "unknown",
        },
      });

      const updatedProject = await svc.getById(id);
      res.json({
        baseline,
        workspace,
        project: updatedProject,
      });
    },
  );

  router.post(
    "/projects/:id/workspaces/:workspaceId/repository-baseline/execution-ready",
    validate(markExecutionContextReadyRequestSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const resolved = await getProjectWorkspaceForRequest(req, res);
      if (!resolved) return;
      assertBoard(req);

      const { project, workspace: currentWorkspace } = resolved;
      const operatingContext = buildEffectiveProjectOperatingContext({ project, workspace: currentWorkspace });
      if (!operatingContext || operatingContext.baselineStatus !== "accepted") {
        res.status(409).json({ error: "Accept repository context before marking execution readiness." });
        return;
      }
      if (!isExecutionContractComplete(operatingContext.executionContract ?? null)) {
        res.status(409).json({ error: "Complete the execution contract before marking execution readiness." });
        return;
      }

      const actor = getActorInfo(req);
      const nextOperatingContext = {
        ...operatingContext,
        executionReadiness: "ready" as const,
        executionReadinessUpdatedAt: new Date().toISOString(),
      };
      await svc.update(id, {
        operatingContext: nextOperatingContext as unknown as Record<string, unknown>,
      });

      const existingBaseline =
        readRepositoryDocumentationBaselineFromMetadata(currentWorkspace.metadata)
        ?? emptyRepositoryDocumentationBaseline();
      await syncRepositoryBaselineTrackingIssue({
        actorUserId: actor.actorType === "user" ? actor.actorId : null,
        baseline: existingBaseline,
        project: {
          ...project,
          operatingContext: nextOperatingContext,
        },
        workspace: currentWorkspace,
      });
      if (existingBaseline.trackingIssueId) {
        await issuesSvc.update(existingBaseline.trackingIssueId, {
          status: "done",
          actorUserId: actor.actorType === "user" ? actor.actorId : null,
          actorAgentId: actor.actorType === "agent" ? actor.agentId ?? null : null,
        });
      }

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_execution_context_ready",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: currentWorkspace.id,
          baselineTrackingIssueId: existingBaseline.trackingIssueId ?? null,
        },
      });

      const updatedProject = await svc.getById(id);
      res.json({
        project: updatedProject,
      });
    },
  );

  router.post(
    "/projects/:id/workspaces/:workspaceId/repository-baseline/execution-contract",
    validate(updateExecutionContractRequestSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const resolved = await getProjectWorkspaceForRequest(req, res);
      if (!resolved) return;
      assertBoard(req);

      const { project, workspace } = resolved;
      const operatingContext = buildEffectiveProjectOperatingContext({ project, workspace });
      if (!operatingContext || operatingContext.baselineStatus !== "accepted") {
        res.status(409).json({ error: "Accept repository context before updating the execution contract." });
        return;
      }

      const request = req.body as {
        packageManager?: string | null;
        installCommand?: string | null;
        verificationCommands?: string[];
        envHandoff?: string | null;
        designAuthority?: string | null;
      };
      const now = new Date().toISOString();
      const currentContract = operatingContext.executionContract ?? {
        packageManager: null,
        installCommand: null,
        verificationCommands: [],
        envHandoff: null,
        designAuthority: null,
        updatedAt: null,
      };
      const nextContract = {
        packageManager: request.packageManager ?? currentContract.packageManager ?? null,
        installCommand: request.installCommand ?? currentContract.installCommand ?? null,
        verificationCommands: request.verificationCommands ?? currentContract.verificationCommands ?? [],
        envHandoff: request.envHandoff ?? currentContract.envHandoff ?? null,
        designAuthority: request.designAuthority ?? currentContract.designAuthority ?? null,
        updatedAt: now,
      };
      const nextOperatingContext = {
        ...operatingContext,
        executionContract: nextContract,
        executionReadiness: isExecutionContractComplete(nextContract)
          ? operatingContext.executionReadiness === "ready"
            ? "ready"
            : "needs_operator_contract"
          : "needs_operator_contract",
        executionReadinessUpdatedAt: now,
      };
      await svc.update(id, {
        operatingContext: nextOperatingContext as unknown as Record<string, unknown>,
      });

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_execution_contract_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          isComplete: isExecutionContractComplete(nextContract),
        },
      });

      const updatedProject = await svc.getById(id);
      res.json({ project: updatedProject });
    },
  );

  router.post(
    "/projects/:id/workspaces/:workspaceId/staffing/hiring-brief-preview",
    validate(generateHiringBriefRequestSchema),
    async (req, res) => {
      const resolved = await getProjectWorkspaceForRequest(req, res);
      if (!resolved) return;
      assertBoard(req);

      const { project, workspace } = resolved;
      const operatingContext = buildEffectiveProjectOperatingContext({ project, workspace });
      const request = req.body as { role: "cto"; sourceIssueId?: string | null };
      if (request.role !== "cto") {
        res.status(422).json({ error: "Unsupported staffing role for this slice" });
        return;
      }
      if (operatingContext?.baselineStatus !== "accepted") {
        res.status(409).json({ error: "Accept the repository baseline before generating a hiring brief." });
        return;
      }

      const preview = buildHiringBriefPreview({
        projectName: project.name,
        operatingContext,
      });
      if (!preview) {
        res.status(422).json({ error: "Paperclip could not derive a hiring brief from the accepted project context." });
        return;
      }

      const response: { preview: HiringBriefPreview } = { preview };
      res.json(response);
    },
  );

  router.post(
    "/projects/:id/workspaces/:workspaceId/staffing/hiring-issues",
    validate(createHiringIssueRequestSchema),
    async (req, res) => {
      const resolved = await getProjectWorkspaceForRequest(req, res);
      if (!resolved) return;
      assertBoard(req);

      const { project, workspace } = resolved;
      const operatingContext = buildEffectiveProjectOperatingContext({ project, workspace });
      const request = req.body as { role: "cto"; sourceIssueId?: string | null };
      if (request.role !== "cto") {
        res.status(422).json({ error: "Unsupported staffing role for this slice" });
        return;
      }
      if (operatingContext?.baselineStatus !== "accepted") {
        res.status(409).json({ error: "Accept the repository baseline before creating a hiring issue." });
        return;
      }
      if (!operatingContext?.baselineTrackingIssueId) {
        res.status(409).json({ error: "Paperclip needs a canonical baseline issue before creating a staffing issue." });
        return;
      }
      if (project.staffingState?.hiringIssueId) {
        res.status(409).json({ error: "A staffing issue already exists for this project." });
        return;
      }

      const preview = buildHiringBriefPreview({
        projectName: project.name,
        operatingContext,
      });
      if (!preview) {
        res.status(422).json({ error: "Paperclip could not derive a hiring brief from the accepted project context." });
        return;
      }

      const actor = getActorInfo(req);
      const issue = await issuesSvc.create(project.companyId, buildHiringIssueCreateInput({
        projectId: project.id,
        projectWorkspaceId: workspace.id,
        baselineIssueId: operatingContext.baselineTrackingIssueId,
        preview,
        actorUserId: actor.actorType === "user" ? actor.actorId : null,
        actorAgentId: actor.agentId,
      }));

      await logActivity(db, {
        companyId: project.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.staffing_issue_created",
        entityType: "project",
        entityId: project.id,
        details: {
          workspaceId: workspace.id,
          role: request.role,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          baselineIssueId: operatingContext.baselineTrackingIssueId,
          baselineIssueIdentifier: operatingContext.baselineTrackingIssueIdentifier,
        },
      });

      res.status(201).json({ issue });
    },
  );

  async function handleProjectWorkspaceRuntimeCommand(req: Request, res: Response) {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const action = String(req.params.action ?? "").trim().toLowerCase();
    if (action !== "start" && action !== "stop" && action !== "restart" && action !== "run") {
      res.status(404).json({ error: "Workspace command action not found" });
      return;
    }

    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, project.companyId);
    assertBoard(req);

    const workspace = project.workspaces.find((entry) => entry.id === workspaceId) ?? null;
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const workspaceCwd = workspace.cwd;
    if (!workspaceCwd) {
      res.status(422).json({ error: "Project workspace needs a local path before Paperclip can run workspace commands" });
      return;
    }

    const runtimeConfig = workspace.runtimeConfig?.workspaceRuntime ?? null;
    const target = req.body as { workspaceCommandId?: string | null; runtimeServiceId?: string | null; serviceIndex?: number | null };
    const configuredServices = runtimeConfig ? listConfiguredRuntimeServiceEntries({ workspaceRuntime: runtimeConfig }) : [];
    const workspaceCommand = runtimeConfig
      ? findWorkspaceCommandDefinition(runtimeConfig, target.workspaceCommandId ?? null)
      : null;
    if (target.workspaceCommandId && !workspaceCommand) {
      res.status(404).json({ error: "Workspace command not found for this project workspace" });
      return;
    }
    if (target.runtimeServiceId && !(workspace.runtimeServices ?? []).some((service) => service.id === target.runtimeServiceId)) {
      res.status(404).json({ error: "Runtime service not found for this project workspace" });
      return;
    }
    const matchedRuntimeService =
      workspaceCommand?.kind === "service" && !target.runtimeServiceId
        ? matchWorkspaceRuntimeServiceToCommand(workspaceCommand, workspace.runtimeServices ?? [])
        : null;
    const selectedRuntimeServiceId = target.runtimeServiceId ?? matchedRuntimeService?.id ?? null;
    const selectedServiceIndex =
      workspaceCommand?.kind === "service"
        ? workspaceCommand.serviceIndex
        : target.serviceIndex ?? null;
    if (
      selectedServiceIndex !== undefined
      && selectedServiceIndex !== null
      && (selectedServiceIndex < 0 || selectedServiceIndex >= configuredServices.length)
    ) {
      res.status(422).json({ error: "Selected runtime service is not defined in this project workspace runtime config" });
      return;
    }
    if (workspaceCommand?.kind === "job" && action !== "run") {
      res.status(422).json({ error: `Workspace job "${workspaceCommand.name}" can only be run` });
      return;
    }
    if (workspaceCommand?.kind === "service" && action === "run") {
      res.status(422).json({ error: `Workspace service "${workspaceCommand.name}" should be started or restarted, not run` });
      return;
    }
    if (action === "run" && !workspaceCommand) {
      res.status(422).json({ error: "Select a workspace job to run" });
      return;
    }
    if ((action === "start" || action === "restart") && !runtimeConfig) {
      res.status(422).json({ error: "Project workspace has no workspace command configuration" });
      return;
    }

    const actor = getActorInfo(req);
    const recorder = workspaceOperations.createRecorder({ companyId: project.companyId });
    let runtimeServiceCount = workspace.runtimeServices?.length ?? 0;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const operation = await recorder.recordOperation({
      phase: action === "stop" ? "workspace_teardown" : "workspace_provision",
      command: workspaceCommand?.command ?? `workspace command ${action}`,
      cwd: workspace.cwd,
      metadata: {
        action,
        projectId: project.id,
        projectWorkspaceId: workspace.id,
        workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
        workspaceCommandKind: workspaceCommand?.kind ?? null,
        workspaceCommandName: workspaceCommand?.name ?? null,
        runtimeServiceId: selectedRuntimeServiceId,
        serviceIndex: selectedServiceIndex,
      },
      run: async () => {
        if (action === "run") {
          if (!workspaceCommand || workspaceCommand.kind !== "job") {
            throw new Error("Workspace job selection is required");
          }
          return await runWorkspaceJobForControl({
            actor: {
              id: actor.agentId ?? null,
              name: actor.actorType === "user" ? "Board" : "Agent",
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: "project_primary",
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: "project_primary",
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
            },
            command: workspaceCommand.rawConfig,
            adapterEnv: {},
            recorder,
            metadata: {
              action,
              projectId: project.id,
              projectWorkspaceId: workspace.id,
              workspaceCommandId: workspaceCommand.id,
            },
          }).then((nestedOperation) => ({
            status: "succeeded" as const,
            exitCode: 0,
            metadata: {
              nestedOperationId: nestedOperation?.id ?? null,
              runtimeServiceCount,
            },
          }));
        }

        const onLog = async (stream: "stdout" | "stderr", chunk: string) => {
          if (stream === "stdout") stdout.push(chunk);
          else stderr.push(chunk);
        };

        if (action === "stop" || action === "restart") {
          await stopRuntimeServicesForProjectWorkspace({
            db,
            projectWorkspaceId: workspace.id,
            runtimeServiceId: selectedRuntimeServiceId,
          });
        }

        if (action === "start" || action === "restart") {
          const startedServices = await startRuntimeServicesForWorkspaceControl({
            db,
            actor: {
              id: actor.agentId ?? null,
              name: actor.actorType === "user" ? "Board" : "Agent",
              companyId: project.companyId,
            },
            issue: null,
            workspace: {
              baseCwd: workspaceCwd,
              source: "project_primary",
              projectId: project.id,
              workspaceId: workspace.id,
              repoUrl: workspace.repoUrl,
              repoRef: workspace.repoRef,
              strategy: "project_primary",
              cwd: workspaceCwd,
              branchName: workspace.defaultRef ?? workspace.repoRef ?? null,
              worktreePath: null,
              warnings: [],
              created: false,
            },
            config: { workspaceRuntime: runtimeConfig },
            adapterEnv: {},
            onLog,
            serviceIndex: selectedServiceIndex,
          });
          runtimeServiceCount = startedServices.length;
        } else {
          runtimeServiceCount = selectedRuntimeServiceId ? Math.max(0, (workspace.runtimeServices?.length ?? 1) - 1) : 0;
        }

        const currentDesiredState: "running" | "stopped" =
          workspace.runtimeConfig?.desiredState
          ?? ((workspace.runtimeServices ?? []).some((service) => service.status === "starting" || service.status === "running")
            ? "running"
            : "stopped");
        const nextRuntimeState: {
          desiredState: "running" | "stopped";
          serviceStates: Record<string, "running" | "stopped"> | null | undefined;
        } = selectedRuntimeServiceId && (selectedServiceIndex === undefined || selectedServiceIndex === null)
          ? {
              desiredState: currentDesiredState,
              serviceStates: workspace.runtimeConfig?.serviceStates ?? null,
            }
          : buildWorkspaceRuntimeDesiredStatePatch({
              config: { workspaceRuntime: runtimeConfig },
              currentDesiredState,
              currentServiceStates: workspace.runtimeConfig?.serviceStates ?? null,
              action,
              serviceIndex: selectedServiceIndex,
            });
        await svc.updateWorkspace(project.id, workspace.id, {
          runtimeConfig: {
            desiredState: nextRuntimeState.desiredState,
            serviceStates: nextRuntimeState.serviceStates,
          },
        });

        return {
          status: "succeeded",
          stdout: stdout.join(""),
          stderr: stderr.join(""),
          system:
            action === "stop"
              ? "Stopped project workspace runtime services.\n"
              : action === "restart"
                ? "Restarted project workspace runtime services.\n"
                : "Started project workspace runtime services.\n",
          metadata: {
            runtimeServiceCount,
            workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
            runtimeServiceId: selectedRuntimeServiceId,
            serviceIndex: selectedServiceIndex,
          },
        };
      },
    });

    const updatedWorkspace = (await svc.listWorkspaces(project.id)).find((entry) => entry.id === workspace.id) ?? workspace;

    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: `project.workspace_runtime_${action}`,
      entityType: "project",
      entityId: project.id,
      details: {
        projectWorkspaceId: workspace.id,
        runtimeServiceCount,
        workspaceCommandId: workspaceCommand?.id ?? target.workspaceCommandId ?? null,
        workspaceCommandKind: workspaceCommand?.kind ?? null,
        workspaceCommandName: workspaceCommand?.name ?? null,
        runtimeServiceId: selectedRuntimeServiceId,
        serviceIndex: selectedServiceIndex,
      },
    });

    res.json({
      workspace: updatedWorkspace,
      operation,
    });
  }

  router.post("/projects/:id/workspaces/:workspaceId/runtime-services/:action", validate(workspaceRuntimeControlTargetSchema), handleProjectWorkspaceRuntimeCommand);
  router.post("/projects/:id/workspaces/:workspaceId/runtime-commands/:action", validate(workspaceRuntimeControlTargetSchema), handleProjectWorkspaceRuntimeCommand);

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  return router;
}
