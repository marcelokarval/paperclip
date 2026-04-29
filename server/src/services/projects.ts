import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { projects, projectGoals, goals, projectWorkspaces, workspaceRuntimeServices, issues, issueApprovals, approvals } from "@paperclipai/db";
import {
  PROJECT_COLORS,
  deriveProjectUrlKey,
  hasNonAsciiContent,
  isUuidLike,
  normalizeProjectUrlKey,
  projectIssueSystemGuidanceSchema,
  projectOperatingContextSchema,
  projectStaffingStateSchema,
  readRepositoryDocumentationBaselineFromMetadata,
  type ExecutiveProjectPacket,
  type ProjectCodebase,
  type ProjectExecutionContract,
  type ProjectExecutionWorkspacePolicy,
  type ProjectGoalRef,
  type ProjectIssueSystemGuidance,
  type ProjectOperatingContext,
  type ProjectOperatingContextSuggestedGoal,
  type HiringBriefPreview,
  type ProjectStaffingState,
  type RepositoryBaselineAcceptedGuidance,
  type RepositoryDocumentationBaseline,
  type TechnicalProjectPacket,
  type ProjectWorkspaceRuntimeConfig,
  type ProjectWorkspace,
  type WorkspaceRuntimeService,
} from "@paperclipai/shared";
import { listCurrentRuntimeServicesForProjectWorkspaces } from "./workspace-runtime-read-model.js";
import { parseProjectExecutionWorkspacePolicy } from "./execution-workspace-policy.js";
import { mergeProjectWorkspaceRuntimeConfig, readProjectWorkspaceRuntimeConfig } from "./project-workspace-runtime-config.js";
import { resolveManagedProjectWorkspaceDir } from "../home-paths.js";

type ProjectRow = typeof projects.$inferSelect;
type ProjectWorkspaceRow = typeof projectWorkspaces.$inferSelect;
type WorkspaceRuntimeServiceRow = typeof workspaceRuntimeServices.$inferSelect;
const REPO_ONLY_CWD_SENTINEL = "/__paperclip_repo_only__";
type CreateWorkspaceInput = {
  name?: string | null;
  sourceType?: string | null;
  cwd?: string | null;
  repoUrl?: string | null;
  repoRef?: string | null;
  defaultRef?: string | null;
  visibility?: string | null;
  setupCommand?: string | null;
  cleanupCommand?: string | null;
  remoteProvider?: string | null;
  remoteWorkspaceRef?: string | null;
  sharedWorkspaceKey?: string | null;
  metadata?: Record<string, unknown> | null;
  runtimeConfig?: Partial<ProjectWorkspaceRuntimeConfig> | null;
  isPrimary?: boolean;
};
type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;

interface ProjectWithGoals extends Omit<ProjectRow, "executionWorkspacePolicy" | "issueSystemGuidance" | "operatingContext"> {
  urlKey: string;
  goalIds: string[];
  goals: ProjectGoalRef[];
  executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
  issueSystemGuidance: ProjectIssueSystemGuidance | null;
  operatingContext: ProjectOperatingContext | null;
  staffingState: ProjectStaffingState | null;
  codebase: ProjectCodebase;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
}

interface ProjectShortnameRow {
  id: string;
  name: string;
}

interface ResolveProjectNameOptions {
  excludeProjectId?: string | null;
}

function readProjectIssueSystemGuidance(value: unknown): ProjectIssueSystemGuidance | null {
  if (!value) return null;
  const parsed = projectIssueSystemGuidanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readProjectOperatingContext(value: unknown): ProjectOperatingContext | null {
  if (!value) return null;
  const parsed = projectOperatingContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readProjectStaffingState(value: unknown): ProjectStaffingState | null {
  if (!value) return null;
  const parsed = projectStaffingStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function applyWorkspaceBaselineRefsToOperatingContext(input: {
  operatingContext: ProjectOperatingContext | null;
  primaryWorkspace: ProjectWorkspace | null;
  workspaces: ProjectWorkspace[];
}): ProjectOperatingContext | null {
  const operatingContext = input.operatingContext ?? null;
  if (!operatingContext) return null;
  if (operatingContext.baselineTrackingIssueId && operatingContext.baselineTrackingIssueIdentifier) {
    return operatingContext;
  }

  const workspaceCandidates = input.primaryWorkspace
    ? [input.primaryWorkspace, ...input.workspaces.filter((workspace) => workspace.id !== input.primaryWorkspace?.id)]
    : input.workspaces;
  for (const workspace of workspaceCandidates) {
    const baseline = readRepositoryDocumentationBaselineFromMetadata(workspace.metadata);
    if (!baseline) continue;
    if (!baseline.trackingIssueId && !baseline.trackingIssueIdentifier) continue;
    return {
      ...operatingContext,
      baselineTrackingIssueId: operatingContext.baselineTrackingIssueId ?? baseline.trackingIssueId ?? null,
      baselineTrackingIssueIdentifier:
        operatingContext.baselineTrackingIssueIdentifier ?? baseline.trackingIssueIdentifier ?? null,
    };
  }

  return operatingContext;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean),
  )];
}

function buildSuggestedGoalsFromBaseline(input: {
  baseline: RepositoryDocumentationBaseline;
  acceptedGuidance: RepositoryBaselineAcceptedGuidance;
}): ProjectOperatingContextSuggestedGoal[] {
  const suggestions: ProjectOperatingContextSuggestedGoal[] = [];
  const pushSuggestion = (suggestion: ProjectOperatingContextSuggestedGoal) => {
    if (suggestions.some((entry) => entry.key === suggestion.key)) return;
    suggestions.push(suggestion);
  };

  const verificationCommands = input.acceptedGuidance.projectDefaults.suggestedVerificationCommands;
  const ownershipAreas = input.acceptedGuidance.projectDefaults.ownershipAreas;
  const canonicalDocs = input.acceptedGuidance.projectDefaults.canonicalDocs;
  const docsOrGaps = uniqueStrings([...(input.baseline.gaps ?? []), ...canonicalDocs]);

  if (verificationCommands.length > 0) {
    pushSuggestion({
      key: "stabilize-verification-workflow",
      title: "Stabilize project verification workflow",
      description: "Confirm and document the canonical verification commands the project should use during issue execution.",
      reason: "The baseline detected repository-specific verification commands that should become stable operator and issue defaults.",
      recommendedLabels: ["documentation"],
      suggestedVerificationCommands: verificationCommands,
      source: "repository_baseline",
      status: "pending",
      acceptedGoalId: null,
    });
  }

  if (ownershipAreas.length > 0) {
    pushSuggestion({
      key: "document-ownership-areas",
      title: "Document ownership areas and routing conventions",
      description: "Capture repository ownership areas so issue routing and future hiring follow the actual project structure.",
      reason: "The baseline detected concrete ownership areas that can improve project coordination without decomposing work.",
      recommendedLabels: uniqueStrings(ownershipAreas.flatMap((area) => area.recommendedLabels)).slice(0, 6),
      suggestedVerificationCommands: verificationCommands.slice(0, 5),
      source: "repository_baseline",
      status: "pending",
      acceptedGoalId: null,
    });
  }

  if (docsOrGaps.length > 0) {
    pushSuggestion({
      key: "consolidate-canonical-docs",
      title: "Consolidate canonical engineering docs",
      description: "Align the project's canonical documentation list and close the highest-value repository documentation gaps.",
      reason: "The baseline found repository docs and/or gaps that should become explicit project operating context.",
      recommendedLabels: ["documentation"],
      suggestedVerificationCommands: verificationCommands.slice(0, 5),
      source: "repository_baseline",
      status: "pending",
      acceptedGoalId: null,
    });
  }

  return suggestions.slice(0, 3);
}

function buildExecutiveProjectPacket(input: {
  baseline: RepositoryDocumentationBaseline;
  acceptedGuidance: RepositoryBaselineAcceptedGuidance;
  operatingGuidance: string[];
}): ExecutiveProjectPacket {
  const topRisks = uniqueStrings(input.baseline.analysis?.risks ?? []).slice(0, 5);
  const topGaps = uniqueStrings(input.baseline.gaps ?? []).slice(0, 5);
  const stackSummary = uniqueStrings(input.baseline.stack).slice(0, 8);
  const docsToReadFirst = uniqueStrings([
    ...input.acceptedGuidance.projectDefaults.canonicalDocs,
    ...input.baseline.documentationFiles,
  ]).slice(0, 8);
  const hasTechnicalSurface =
    stackSummary.length > 0
    || docsToReadFirst.length > 0
    || input.acceptedGuidance.projectDefaults.ownershipAreas.length > 0
    || input.acceptedGuidance.projectDefaults.suggestedVerificationCommands.length > 0;

  return {
    projectSummary: input.baseline.summary?.trim() || "Existing repository baseline accepted.",
    baselineTrackingIssueIdentifier: input.baseline.trackingIssueIdentifier ?? null,
    topRisks,
    topGaps,
    stackSummary,
    docsToReadFirst,
    operatingGuidance: input.operatingGuidance,
    hiringSignals: hasTechnicalSurface ? ["cto"] : [],
  };
}

function buildTechnicalProjectPacket(input: {
  baseline: RepositoryDocumentationBaseline;
  acceptedGuidance: RepositoryBaselineAcceptedGuidance;
  issueSystemGuidance: ProjectIssueSystemGuidance | null;
}): TechnicalProjectPacket {
  return {
    projectSummary: input.baseline.summary?.trim() || "Existing repository technical context accepted.",
    stackSignals: uniqueStrings(input.baseline.stack),
    canonicalDocs: uniqueStrings(input.acceptedGuidance.projectDefaults.canonicalDocs),
    verificationCommands: uniqueStrings(input.acceptedGuidance.projectDefaults.suggestedVerificationCommands),
    ownershipAreas: input.acceptedGuidance.projectDefaults.ownershipAreas.map((area) => ({
      name: area.name,
      paths: uniqueStrings(area.paths),
      recommendedLabels: uniqueStrings(area.recommendedLabels),
    })),
    labelCatalog: input.acceptedGuidance.labels.map((label) => ({
      name: label.name,
      description: label.description,
    })),
    issueGuidance: uniqueStrings([
      ...(input.issueSystemGuidance?.labelUsageGuidance ?? []),
      ...(input.issueSystemGuidance?.parentChildGuidance ?? []),
      ...(input.issueSystemGuidance?.blockingGuidance ?? []),
      ...(input.issueSystemGuidance?.reviewGuidance ?? []),
      ...(input.issueSystemGuidance?.approvalGuidance ?? []),
    ]),
  };
}

export function buildProjectOperatingContextFromBaseline(input: {
  baseline: RepositoryDocumentationBaseline;
  acceptedGuidance: RepositoryBaselineAcceptedGuidance | null;
  issueSystemGuidance: ProjectIssueSystemGuidance | null;
  projectDescription?: string | null;
  baselineStatus?: ProjectOperatingContext["baselineStatus"];
  executionReadiness?: NonNullable<ProjectOperatingContext["executionReadiness"]>;
}): ProjectOperatingContext | null {
  if (!input.acceptedGuidance) return null;

  const canonicalDocs = uniqueStrings(input.acceptedGuidance.projectDefaults.canonicalDocs);
  const verificationCommands = uniqueStrings(input.acceptedGuidance.projectDefaults.suggestedVerificationCommands);
  const ownershipAreas = input.acceptedGuidance.projectDefaults.ownershipAreas.map((area) => ({
    name: area.name,
    paths: uniqueStrings(area.paths),
    recommendedLabels: uniqueStrings(area.recommendedLabels),
  }));
  const operatingGuidance = uniqueStrings([
    "For repo-first projects, review the baseline tracking issue before creating implementation issues.",
    "Treat baseline-derived suggestions as project context, not automatic backlog decomposition.",
    ...input.acceptedGuidance.issuePolicy.labelUsageGuidance,
    ...input.acceptedGuidance.issuePolicy.reviewGuidance,
    ...input.acceptedGuidance.issuePolicy.approvalGuidance,
    ...(input.baseline.analysis?.agentGuidance ?? []),
  ]);

  const descriptionSource = typeof input.projectDescription === "string" && input.projectDescription.trim().length > 0
    ? "manual"
    : "none";
  const baselineStatus = input.baselineStatus ?? "accepted";
  const executionReadiness = input.executionReadiness ?? (baselineStatus === "accepted"
    ? "needs_operator_contract"
    : "unknown");

  return {
    baselineStatus,
    baselineAcceptedAt: baselineStatus === "accepted" ? input.acceptedGuidance.acceptedAt : null,
    executionReadiness,
    executionReadinessUpdatedAt: baselineStatus === "accepted" ? input.acceptedGuidance.acceptedAt : null,
    executionContract: null,
    baselineTrackingIssueId: input.baseline.trackingIssueId ?? null,
    baselineTrackingIssueIdentifier: input.baseline.trackingIssueIdentifier ?? null,
    baselineFingerprint: input.baseline.updatedAt?.trim() ? `${input.baseline.status}:${input.baseline.updatedAt}` : null,
    overviewSummary: input.baseline.summary?.trim() || null,
    configurationDescriptionSuggestion: input.baseline.summary?.trim() || null,
    descriptionSource,
    labelCatalog: input.acceptedGuidance.labels.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description,
      source: "repository_baseline",
      evidence: uniqueStrings(label.evidence),
      confidence: label.confidence,
    })),
    canonicalDocs,
    verificationCommands,
    ownershipAreas,
    operatingGuidance,
    suggestedGoals: buildSuggestedGoalsFromBaseline({
      baseline: input.baseline,
      acceptedGuidance: input.acceptedGuidance,
    }),
    executiveProjectPacket: buildExecutiveProjectPacket({
      baseline: input.baseline,
      acceptedGuidance: input.acceptedGuidance,
      operatingGuidance,
    }),
    technicalProjectPacket: buildTechnicalProjectPacket({
      baseline: input.baseline,
      acceptedGuidance: input.acceptedGuidance,
      issueSystemGuidance: input.issueSystemGuidance,
    }),
  };
}

export function isExecutionContractComplete(contract: ProjectExecutionContract | null | undefined): boolean {
  if (!contract) return false;
  return Boolean(
    contract.packageManager?.trim()
    && contract.installCommand?.trim()
    && contract.verificationCommands.length > 0
    && contract.envHandoff?.trim()
    && contract.designAuthority?.trim(),
  );
}

export function buildProjectStaffingState(input: {
  operatingContext: ProjectOperatingContext | null;
  existing?: ProjectStaffingState | null;
}): ProjectStaffingState | null {
  const existing = readProjectStaffingState(input.existing ?? null);
  const operatingContext = input.operatingContext ?? null;
  if (!operatingContext) return existing;

  const recommendedRole = operatingContext.executiveProjectPacket?.hiringSignals[0] ?? null;
  const status = existing?.status ?? "not_started";

  const hasSurface =
    Boolean(recommendedRole)
    || Boolean(operatingContext.baselineTrackingIssueId)
    || Boolean(operatingContext.baselineTrackingIssueIdentifier);
  if (!hasSurface) return existing ?? null;

  return {
    recommendedRole,
    status,
    baselineIssueId: operatingContext.baselineTrackingIssueId ?? null,
    baselineIssueIdentifier: operatingContext.baselineTrackingIssueIdentifier ?? null,
    hiringIssueId: existing?.hiringIssueId ?? null,
    hiringIssueIdentifier: existing?.hiringIssueIdentifier ?? null,
    lastBriefGeneratedAt: existing?.lastBriefGeneratedAt ?? null,
  };
}

function buildHiringIssueDescription(preview: HiringBriefPreview): string {
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return null;
    return [`## ${title}`, ...items.map((item) => `- ${item}`)].join("\n");
  };

  return [
    preview.summary,
    "",
    section("Source signals", preview.sourceSignals),
    section("Why this hire exists", preview.rationale),
    section("Project context", preview.projectContext),
    section("Known risks and gaps", preview.risks),
    section("Expected first output", preview.expectedFirstOutput),
    section("Guardrails", preview.guardrails),
    section("Success criteria", preview.successCriteria),
    preview.canonicalReferences.length > 0
      ? [
          "## Canonical references",
          ...preview.canonicalReferences.map((reference) => `- ${reference.label}: ${reference.value}`),
        ].join("\n")
      : null,
  ].filter(Boolean).join("\n\n");
}

export function buildHiringBriefPreview(input: {
  projectName: string;
  operatingContext: ProjectOperatingContext | null;
}): HiringBriefPreview | null {
  const operatingContext = input.operatingContext ?? null;
  if (!operatingContext || operatingContext.baselineStatus !== "accepted") return null;

  const executivePacket = operatingContext.executiveProjectPacket ?? null;
  const technicalPacket = operatingContext.technicalProjectPacket ?? null;
  const recommendedRole = executivePacket?.hiringSignals[0] ?? null;
  if (recommendedRole !== "cto") return null;
  const executionContract = operatingContext.executionContract ?? null;
  const executionClarifications = uniqueStrings([
    executionContract?.packageManager?.trim()
      ? null
      : "Confirm the canonical package manager and runtime for this repository.",
    executionContract?.installCommand?.trim()
      ? null
      : "Confirm the canonical install/bootstrap command before implementation begins.",
    executionContract?.verificationCommands.length
      ? null
      : "Confirm the canonical verification command set and precedence.",
    executionContract?.envHandoff?.trim()
      ? null
      : "Confirm env/bootstrap handoff, secret source, and startup assumptions.",
    executionContract?.designAuthority?.trim()
      ? null
      : "Confirm the design authority rule and how premium direction applies.",
  ]);

  const sourceSignals = uniqueStrings([
    "Accepted repository baseline",
    operatingContext.baselineTrackingIssueIdentifier ? `Baseline issue ${operatingContext.baselineTrackingIssueIdentifier}` : null,
    executivePacket ? "Executive project packet" : null,
    technicalPacket ? "Technical project packet" : null,
    operatingContext.canonicalDocs.length > 0 ? "Canonical docs" : null,
    operatingContext.verificationCommands.length > 0 ? "Verification defaults" : null,
    operatingContext.ownershipAreas.length > 0 ? "Ownership areas" : null,
    executionClarifications.length > 0 ? "Open execution clarifications" : null,
  ]);

  const rationale = uniqueStrings([
    "This project already has an accepted technical baseline and now needs a technical owner who can turn that context into an execution-ready plan.",
    executivePacket?.projectSummary ?? null,
    executivePacket?.topGaps[0] ?? null,
    technicalPacket?.stackSignals.length ? `Detected stack: ${technicalPacket.stackSignals.slice(0, 6).join(", ")}.` : null,
  ]).slice(0, 6);

  const projectContext = uniqueStrings([
    technicalPacket?.stackSignals.length ? `Stack signals: ${technicalPacket.stackSignals.slice(0, 8).join(", ")}` : null,
    operatingContext.canonicalDocs.length ? `Canonical docs: ${operatingContext.canonicalDocs.slice(0, 6).join(", ")}` : null,
    operatingContext.verificationCommands.length ? `Verification commands: ${operatingContext.verificationCommands.slice(0, 5).join(", ")}` : null,
    operatingContext.ownershipAreas.length
      ? `Ownership areas: ${operatingContext.ownershipAreas.slice(0, 4).map((area) => area.name).join(", ")}`
      : null,
    executionClarifications.length
      ? `Open execution clarifications: ${executionClarifications.join(" ")}`
      : null,
    operatingContext.operatingGuidance[0] ?? null,
  ]).slice(0, 8);

  const risks = uniqueStrings([
    ...(executivePacket?.topRisks ?? []),
    ...(executivePacket?.topGaps ?? []),
    ...executionClarifications,
  ]).slice(0, 8);

  const expectedFirstOutput = uniqueStrings([
    "Read the canonical baseline issue and confirm the current technical shape of the project.",
    "Publish a concise technical onboarding and framing comment before implementation begins.",
    "Validate stack signals, canonical docs, verification commands, and ownership areas against the real repository.",
    executionClarifications.length
      ? "Close the open execution clarifications as part of the first technical framing pass."
      : null,
    "Propose the first technical execution plan only after the framing is stable.",
  ]);

  const guardrails = uniqueStrings([
    "Do not start implementation before publishing an initial technical framing comment.",
    "Treat the baseline issue as the canonical technical source of truth for this repository.",
    "Use the hiring issue as the operational entrypoint for the role, not as a replacement for the baseline issue.",
    "Do not decompose work or create sub-issues unless that decomposition is explicitly justified after onboarding.",
  ]);

  const canonicalReferences = [
    ...(operatingContext.baselineTrackingIssueIdentifier
      ? [{
          type: "issue" as const,
          label: "Canonical baseline issue",
          value: operatingContext.baselineTrackingIssueIdentifier,
        }]
      : []),
    {
      type: "project" as const,
      label: "Project",
      value: input.projectName,
    },
    ...operatingContext.canonicalDocs.slice(0, 8).map((doc) => ({
      type: "doc" as const,
      label: "Canonical doc",
      value: doc,
    })),
  ];

  const successCriteria = uniqueStrings([
    "A grounded technical onboarding comment is published in the first response.",
    "The role confirms the repository's current stack, docs, verification defaults, and ownership signals.",
    "The first technical plan stays aligned with the accepted baseline and avoids premature decomposition.",
  ]);

  return {
    role: "cto",
    title: `Hire CTO for ${input.projectName}`,
    summary: executivePacket?.projectSummary
      ?? operatingContext.overviewSummary
      ?? `Technical hiring brief for ${input.projectName}.`,
    sourceSignals,
    rationale,
    projectContext,
    risks,
    expectedFirstOutput,
    guardrails,
    canonicalReferences,
    successCriteria,
  };
}

export function buildHiringIssueCreateInput(input: {
  projectId: string;
  projectWorkspaceId: string;
  baselineIssueId: string;
  preview: HiringBriefPreview;
  actorUserId: string | null;
  actorAgentId: string | null;
}) {
  return {
    projectId: input.projectId,
    projectWorkspaceId: input.projectWorkspaceId,
    parentId: input.baselineIssueId,
    title: input.preview.title,
    description: buildHiringIssueDescription(input.preview),
    status: "backlog" as const,
    priority: "high" as const,
    assigneeAgentId: null,
    assigneeUserId: null,
    requestDepth: 0,
    originKind: "staffing_hiring",
    originId: input.baselineIssueId,
    createdByAgentId: input.actorAgentId,
    createdByUserId: input.actorUserId,
  };
}

/** Batch-load goal refs for a set of projects. */
async function attachGoals(db: Db, rows: ProjectRow[]): Promise<ProjectWithGoals[]> {
  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.id);

  // Fetch join rows + goal titles in one query
  const links = await db
    .select({
      projectId: projectGoals.projectId,
      goalId: projectGoals.goalId,
      goalTitle: goals.title,
    })
    .from(projectGoals)
    .innerJoin(goals, eq(projectGoals.goalId, goals.id))
    .where(inArray(projectGoals.projectId, projectIds));

  const map = new Map<string, ProjectGoalRef[]>();
  for (const link of links) {
    let arr = map.get(link.projectId);
    if (!arr) {
      arr = [];
      map.set(link.projectId, arr);
    }
    arr.push({ id: link.goalId, title: link.goalTitle });
  }

  const hiringIssueRows = await db
    .select({
      id: issues.id,
      projectId: issues.projectId,
      identifier: issues.identifier,
      createdAt: issues.createdAt,
    })
    .from(issues)
    .where(
      and(
        inArray(issues.projectId, projectIds),
        eq(issues.originKind, "staffing_hiring"),
        isNull(issues.hiddenAt),
      ),
    )
    .orderBy(desc(issues.createdAt), desc(issues.id));

  const hiringIssueByProjectId = new Map<string, { id: string; identifier: string | null; createdAt: Date }>();
  for (const row of hiringIssueRows) {
    if (!row.projectId || hiringIssueByProjectId.has(row.projectId)) continue;
    hiringIssueByProjectId.set(row.projectId, row);
  }

  const hiringApprovalRows = hiringIssueRows.length === 0
    ? []
    : await db
      .select({
        issueId: issues.id,
        approvalStatus: approvals.status,
      })
      .from(issues)
      .innerJoin(issueApprovals, eq(issueApprovals.issueId, issues.id))
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(
        and(
          inArray(issues.id, hiringIssueRows.map((row) => row.id)),
          eq(approvals.type, "hire_agent"),
        ),
      )
      .orderBy(desc(issueApprovals.createdAt));

  const latestHiringApprovalStatusByIssueId = new Map<string, string>();
  for (const row of hiringApprovalRows) {
    if (!latestHiringApprovalStatusByIssueId.has(row.issueId)) {
      latestHiringApprovalStatusByIssueId.set(row.issueId, row.approvalStatus);
    }
  }

  return rows.map((r) => {
    const g = map.get(r.id) ?? [];
    const operatingContext = readProjectOperatingContext(r.operatingContext);
    const hiringIssue = hiringIssueByProjectId.get(r.id) ?? null;
    const approvalStatus = hiringIssue ? latestHiringApprovalStatusByIssueId.get(hiringIssue.id) ?? null : null;
    const staffingStatus =
      approvalStatus === "approved"
        ? "hire_approved"
        : approvalStatus === "pending" || approvalStatus === "revision_requested"
          ? "approval_pending"
          : hiringIssue
            ? "issue_created"
            : "not_started";
    return {
      ...r,
      urlKey: deriveProjectUrlKey(r.name, r.id),
      goalIds: g.map((x) => x.id),
      goals: g,
      executionWorkspacePolicy: parseProjectExecutionWorkspacePolicy(r.executionWorkspacePolicy),
      issueSystemGuidance: readProjectIssueSystemGuidance(r.issueSystemGuidance),
      operatingContext,
      staffingState: buildProjectStaffingState({
        operatingContext,
        existing: hiringIssue
          ? {
              recommendedRole: "cto",
              status: staffingStatus,
              baselineIssueId: operatingContext?.baselineTrackingIssueId ?? null,
              baselineIssueIdentifier: operatingContext?.baselineTrackingIssueIdentifier ?? null,
              hiringIssueId: hiringIssue.id,
              hiringIssueIdentifier: hiringIssue.identifier,
              lastBriefGeneratedAt: hiringIssue.createdAt.toISOString(),
            }
          : null,
      }),
    } as ProjectWithGoals;
  });
}

function toRuntimeService(row: WorkspaceRuntimeServiceRow): WorkspaceRuntimeService {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    projectWorkspaceId: row.projectWorkspaceId ?? null,
    executionWorkspaceId: row.executionWorkspaceId ?? null,
    issueId: row.issueId ?? null,
    scopeType: row.scopeType as WorkspaceRuntimeService["scopeType"],
    scopeId: row.scopeId ?? null,
    serviceName: row.serviceName,
    status: row.status as WorkspaceRuntimeService["status"],
    lifecycle: row.lifecycle as WorkspaceRuntimeService["lifecycle"],
    reuseKey: row.reuseKey ?? null,
    command: row.command ?? null,
    cwd: row.cwd ?? null,
    port: row.port ?? null,
    url: row.url ?? null,
    provider: row.provider as WorkspaceRuntimeService["provider"],
    providerRef: row.providerRef ?? null,
    ownerAgentId: row.ownerAgentId ?? null,
    startedByRunId: row.startedByRunId ?? null,
    lastUsedAt: row.lastUsedAt,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt ?? null,
    stopPolicy: (row.stopPolicy as Record<string, unknown> | null) ?? null,
    healthStatus: row.healthStatus as WorkspaceRuntimeService["healthStatus"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWorkspace(
  row: ProjectWorkspaceRow,
  runtimeServices: WorkspaceRuntimeService[] = [],
): ProjectWorkspace {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    name: row.name,
    sourceType: row.sourceType as ProjectWorkspace["sourceType"],
    cwd: normalizeWorkspaceCwd(row.cwd),
    repoUrl: row.repoUrl ?? null,
    repoRef: row.repoRef ?? null,
    defaultRef: row.defaultRef ?? row.repoRef ?? null,
    visibility: row.visibility as ProjectWorkspace["visibility"],
    setupCommand: row.setupCommand ?? null,
    cleanupCommand: row.cleanupCommand ?? null,
    remoteProvider: row.remoteProvider ?? null,
    remoteWorkspaceRef: row.remoteWorkspaceRef ?? null,
    sharedWorkspaceKey: row.sharedWorkspaceKey ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    runtimeConfig: readProjectWorkspaceRuntimeConfig((row.metadata as Record<string, unknown> | null) ?? null),
    isPrimary: row.isPrimary,
    runtimeServices,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function deriveRepoNameFromRepoUrl(repoUrl: string | null): string | null {
  const raw = readNonEmptyString(repoUrl);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const cleanedPath = parsed.pathname.replace(/\/+$/, "");
    const repoName = cleanedPath.split("/").filter(Boolean).pop()?.replace(/\.git$/i, "") ?? "";
    return repoName || null;
  } catch {
    return null;
  }
}

function deriveProjectCodebase(input: {
  companyId: string;
  projectId: string;
  primaryWorkspace: ProjectWorkspace | null;
  fallbackWorkspaces: ProjectWorkspace[];
}): ProjectCodebase {
  const primaryWorkspace = input.primaryWorkspace ?? input.fallbackWorkspaces[0] ?? null;
  const repoUrl = primaryWorkspace?.repoUrl ?? null;
  const repoName = deriveRepoNameFromRepoUrl(repoUrl);
  const localFolder = primaryWorkspace?.cwd ?? null;
  const managedFolder = resolveManagedProjectWorkspaceDir({
    companyId: input.companyId,
    projectId: input.projectId,
    repoName,
  });

  return {
    workspaceId: primaryWorkspace?.id ?? null,
    repoUrl,
    repoRef: primaryWorkspace?.repoRef ?? null,
    defaultRef: primaryWorkspace?.defaultRef ?? null,
    repoName,
    localFolder,
    managedFolder,
    effectiveLocalFolder: localFolder ?? managedFolder,
    origin: localFolder ? "local_folder" : "managed_checkout",
  };
}

function pickPrimaryWorkspace(
  rows: ProjectWorkspaceRow[],
  runtimeServicesByWorkspaceId?: Map<string, WorkspaceRuntimeService[]>,
): ProjectWorkspace | null {
  if (rows.length === 0) return null;
  const explicitPrimary = rows.find((row) => row.isPrimary);
  const primary = explicitPrimary ?? rows[0];
  return toWorkspace(primary, runtimeServicesByWorkspaceId?.get(primary.id) ?? []);
}

/** Batch-load workspace refs for a set of projects. */
async function attachWorkspaces(db: Db, rows: ProjectWithGoals[]): Promise<ProjectWithGoals[]> {
  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.id);
  const workspaceRows = await db
    .select()
    .from(projectWorkspaces)
    .where(inArray(projectWorkspaces.projectId, projectIds))
    .orderBy(desc(projectWorkspaces.isPrimary), asc(projectWorkspaces.createdAt), asc(projectWorkspaces.id));
  const runtimeServicesByWorkspaceId = await listCurrentRuntimeServicesForProjectWorkspaces(
    db,
    rows[0]!.companyId,
    workspaceRows.map((workspace) => workspace.id),
  );
  const sharedRuntimeServicesByWorkspaceId = new Map(
    Array.from(runtimeServicesByWorkspaceId.entries()).map(([workspaceId, services]) => [
      workspaceId,
      services.map(toRuntimeService),
    ]),
  );

  const map = new Map<string, ProjectWorkspaceRow[]>();
  for (const row of workspaceRows) {
    let arr = map.get(row.projectId);
    if (!arr) {
      arr = [];
      map.set(row.projectId, arr);
    }
    arr.push(row);
  }

  return rows.map((row) => {
    const projectWorkspaceRows = map.get(row.id) ?? [];
    const workspaces = projectWorkspaceRows.map((workspace) =>
      toWorkspace(
        workspace,
        sharedRuntimeServicesByWorkspaceId.get(workspace.id) ?? [],
      ),
    );
    const primaryWorkspace = pickPrimaryWorkspace(projectWorkspaceRows, sharedRuntimeServicesByWorkspaceId);
    const operatingContext = applyWorkspaceBaselineRefsToOperatingContext({
      operatingContext: row.operatingContext,
      primaryWorkspace,
      workspaces,
    });
    return {
      ...row,
      operatingContext,
      staffingState: buildProjectStaffingState({
        operatingContext,
        existing: row.staffingState,
      }),
      codebase: deriveProjectCodebase({
        companyId: row.companyId,
        projectId: row.id,
        primaryWorkspace,
        fallbackWorkspaces: workspaces,
      }),
      workspaces,
      primaryWorkspace,
    };
  });
}

/** Sync the project_goals join table for a single project. */
async function syncGoalLinks(db: Db, projectId: string, companyId: string, goalIds: string[]) {
  // Delete existing links
  await db.delete(projectGoals).where(eq(projectGoals.projectId, projectId));

  // Insert new links
  if (goalIds.length > 0) {
    await db.insert(projectGoals).values(
      goalIds.map((goalId) => ({ projectId, goalId, companyId })),
    );
  }
}

/** Resolve goalIds from input, handling the legacy goalId field. */
function resolveGoalIds(data: { goalIds?: string[]; goalId?: string | null }): string[] | undefined {
  if (data.goalIds !== undefined) return data.goalIds;
  if (data.goalId !== undefined) {
    return data.goalId ? [data.goalId] : [];
  }
  return undefined;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeWorkspaceCwd(value: unknown): string | null {
  const cwd = readNonEmptyString(value);
  if (!cwd) return null;
  return cwd === REPO_ONLY_CWD_SENTINEL ? null : cwd;
}

function deriveNameFromCwd(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "Local folder";
}

function deriveNameFromRepoUrl(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    const cleanedPath = url.pathname.replace(/\/+$/, "");
    const lastSegment = cleanedPath.split("/").filter(Boolean).pop() ?? "";
    const noGitSuffix = lastSegment.replace(/\.git$/i, "");
    return noGitSuffix || repoUrl;
  } catch {
    return repoUrl;
  }
}

function deriveWorkspaceName(input: {
  name?: string | null;
  cwd?: string | null;
  repoUrl?: string | null;
}) {
  const explicit = readNonEmptyString(input.name);
  if (explicit) return explicit;

  const cwd = readNonEmptyString(input.cwd);
  if (cwd) return deriveNameFromCwd(cwd);

  const repoUrl = readNonEmptyString(input.repoUrl);
  if (repoUrl) return deriveNameFromRepoUrl(repoUrl);

  return "Workspace";
}

export function resolveProjectNameForUniqueShortname(
  requestedName: string,
  existingProjects: ProjectShortnameRow[],
  options?: ResolveProjectNameOptions,
): string {
  const requestedShortname = normalizeProjectUrlKey(requestedName);
  if (!requestedShortname) return requestedName;
  // Non-ASCII names get a UUID suffix in deriveProjectUrlKey, making slugs inherently unique.
  if (hasNonAsciiContent(requestedName)) return requestedName;

  const usedShortnames = new Set(
    existingProjects
      .filter((project) => !(options?.excludeProjectId && project.id === options.excludeProjectId))
      .map((project) => normalizeProjectUrlKey(project.name))
      .filter((value): value is string => value !== null),
  );
  if (!usedShortnames.has(requestedShortname)) return requestedName;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidateName = `${requestedName} ${suffix}`;
    const candidateShortname = normalizeProjectUrlKey(candidateName);
    if (candidateShortname && !usedShortnames.has(candidateShortname)) {
      return candidateName;
    }
  }

  // Fallback guard for pathological naming collisions.
  return `${requestedName} ${Date.now()}`;
}

async function ensureSinglePrimaryWorkspace(
  dbOrTx: any,
  input: {
    companyId: string;
    projectId: string;
    keepWorkspaceId: string;
  },
) {
  await dbOrTx
    .update(projectWorkspaces)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(projectWorkspaces.companyId, input.companyId),
        eq(projectWorkspaces.projectId, input.projectId),
      ),
    );

  await dbOrTx
    .update(projectWorkspaces)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(
      and(
        eq(projectWorkspaces.companyId, input.companyId),
        eq(projectWorkspaces.projectId, input.projectId),
        eq(projectWorkspaces.id, input.keepWorkspaceId),
      ),
    );
}

export function projectService(db: Db) {
  return {
    list: async (companyId: string): Promise<ProjectWithGoals[]> => {
      const rows = await db.select().from(projects).where(eq(projects.companyId, companyId));
      const withGoals = await attachGoals(db, rows);
      return attachWorkspaces(db, withGoals);
    },

    listByIds: async (companyId: string, ids: string[]): Promise<ProjectWithGoals[]> => {
      const dedupedIds = [...new Set(ids)];
      if (dedupedIds.length === 0) return [];
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.companyId, companyId), inArray(projects.id, dedupedIds)));
      const withGoals = await attachGoals(db, rows);
      const withWorkspaces = await attachWorkspaces(db, withGoals);
      const byId = new Map(withWorkspaces.map((project) => [project.id, project]));
      return dedupedIds.map((id) => byId.get(id)).filter((project): project is ProjectWithGoals => Boolean(project));
    },

    getById: async (id: string): Promise<ProjectWithGoals | null> => {
      const row = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .then((rows) => rows[0] ?? null);
      if (!row) return null;
      const [withGoals] = await attachGoals(db, [row]);
      if (!withGoals) return null;
      const [enriched] = await attachWorkspaces(db, [withGoals]);
      return enriched ?? null;
    },

    create: async (
      companyId: string,
      data: Omit<typeof projects.$inferInsert, "companyId"> & { goalIds?: string[] },
    ): Promise<ProjectWithGoals> => {
      const { goalIds: inputGoalIds, ...projectData } = data;
      const ids = resolveGoalIds({ goalIds: inputGoalIds, goalId: projectData.goalId });

      // Auto-assign a color from the palette if none provided
      if (!projectData.color) {
        const existing = await db.select({ color: projects.color }).from(projects).where(eq(projects.companyId, companyId));
        const usedColors = new Set(existing.map((r) => r.color).filter(Boolean));
        const nextColor = PROJECT_COLORS.find((c) => !usedColors.has(c)) ?? PROJECT_COLORS[existing.length % PROJECT_COLORS.length];
        projectData.color = nextColor;
      }

      const existingProjects = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.companyId, companyId));
      projectData.name = resolveProjectNameForUniqueShortname(projectData.name, existingProjects);

      // Also write goalId to the legacy column (first goal or null)
      const legacyGoalId = ids && ids.length > 0 ? ids[0] : projectData.goalId ?? null;

      const row = await db
        .insert(projects)
        .values({ ...projectData, goalId: legacyGoalId, companyId })
        .returning()
        .then((rows) => rows[0]);

      if (ids && ids.length > 0) {
        await syncGoalLinks(db, row.id, companyId, ids);
      }

      const [withGoals] = await attachGoals(db, [row]);
      const [enriched] = withGoals ? await attachWorkspaces(db, [withGoals]) : [];
      return enriched!;
    },

    update: async (
      id: string,
      data: Partial<typeof projects.$inferInsert> & { goalIds?: string[] },
    ): Promise<ProjectWithGoals | null> => {
      const { goalIds: inputGoalIds, ...projectData } = data;
      const ids = resolveGoalIds({ goalIds: inputGoalIds, goalId: projectData.goalId });
      const existingProject = await db
        .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
        .from(projects)
        .where(eq(projects.id, id))
        .then((rows) => rows[0] ?? null);
      if (!existingProject) return null;

      if (projectData.name !== undefined) {
        const existingShortname = normalizeProjectUrlKey(existingProject.name);
        const nextShortname = normalizeProjectUrlKey(projectData.name);
        if (existingShortname !== nextShortname) {
          const existingProjects = await db
            .select({ id: projects.id, name: projects.name })
            .from(projects)
            .where(eq(projects.companyId, existingProject.companyId));
          projectData.name = resolveProjectNameForUniqueShortname(projectData.name, existingProjects, {
            excludeProjectId: id,
          });
        }
      }

      // Keep legacy goalId column in sync
      const updates: Partial<typeof projects.$inferInsert> = {
        ...projectData,
        updatedAt: new Date(),
      };
      if (ids !== undefined) {
        updates.goalId = ids.length > 0 ? ids[0] : null;
      }

      const row = await db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (!row) return null;

      if (ids !== undefined) {
        await syncGoalLinks(db, id, row.companyId, ids);
      }

      const [withGoals] = await attachGoals(db, [row]);
      const [enriched] = withGoals ? await attachWorkspaces(db, [withGoals]) : [];
      return enriched ?? null;
    },

    remove: (id: string) =>
      db
        .delete(projects)
        .where(eq(projects.id, id))
        .returning()
        .then((rows) => {
          const row = rows[0] ?? null;
          if (!row) return null;
          return { ...row, urlKey: deriveProjectUrlKey(row.name, row.id) };
        }),

    listWorkspaces: async (projectId: string): Promise<ProjectWorkspace[]> => {
      const rows = await db
        .select()
        .from(projectWorkspaces)
        .where(eq(projectWorkspaces.projectId, projectId))
        .orderBy(desc(projectWorkspaces.isPrimary), asc(projectWorkspaces.createdAt), asc(projectWorkspaces.id));
      if (rows.length === 0) return [];
      const runtimeServicesByWorkspaceId = await listCurrentRuntimeServicesForProjectWorkspaces(
        db,
        rows[0]!.companyId,
        rows.map((workspace) => workspace.id),
      );
      return rows.map((row) =>
        toWorkspace(
          row,
          (runtimeServicesByWorkspaceId.get(row.id) ?? []).map(toRuntimeService),
        ),
      );
    },

    createWorkspace: async (
      projectId: string,
      data: CreateWorkspaceInput,
    ): Promise<ProjectWorkspace | null> => {
      const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .then((rows) => rows[0] ?? null);
      if (!project) return null;

      const cwd = normalizeWorkspaceCwd(data.cwd);
      const repoUrl = readNonEmptyString(data.repoUrl);
      const sourceType = readNonEmptyString(data.sourceType) ?? (repoUrl ? "git_repo" : cwd ? "local_path" : "remote_managed");
      const remoteWorkspaceRef = readNonEmptyString(data.remoteWorkspaceRef);
      if (sourceType === "remote_managed") {
        if (!remoteWorkspaceRef && !repoUrl) return null;
      } else if (!cwd && !repoUrl) {
        return null;
      }
      const name = deriveWorkspaceName({
        name: data.name,
        cwd,
        repoUrl,
      });

      const existing = await db
        .select()
        .from(projectWorkspaces)
        .where(eq(projectWorkspaces.projectId, projectId))
        .orderBy(asc(projectWorkspaces.createdAt))
        .then((rows) => rows);

      const shouldBePrimary = data.isPrimary === true || existing.length === 0;
      const created = await db.transaction(async (tx) => {
        if (shouldBePrimary) {
          await tx
            .update(projectWorkspaces)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(projectWorkspaces.companyId, project.companyId),
                eq(projectWorkspaces.projectId, projectId),
              ),
            );
        }

        const row = await tx
          .insert(projectWorkspaces)
          .values({
            companyId: project.companyId,
            projectId,
            name,
            sourceType,
            cwd: cwd ?? null,
            repoUrl: repoUrl ?? null,
            repoRef: readNonEmptyString(data.repoRef),
            defaultRef: readNonEmptyString(data.defaultRef) ?? readNonEmptyString(data.repoRef),
            visibility: readNonEmptyString(data.visibility) ?? "default",
            setupCommand: readNonEmptyString(data.setupCommand),
            cleanupCommand: readNonEmptyString(data.cleanupCommand),
            remoteProvider: readNonEmptyString(data.remoteProvider),
            remoteWorkspaceRef,
            sharedWorkspaceKey: readNonEmptyString(data.sharedWorkspaceKey),
            metadata:
              data.runtimeConfig !== undefined
                ? mergeProjectWorkspaceRuntimeConfig(
                    (data.metadata as Record<string, unknown> | null | undefined) ?? null,
                    data.runtimeConfig ?? null,
                  )
                : (data.metadata as Record<string, unknown> | null | undefined) ?? null,
            isPrimary: shouldBePrimary,
          })
          .returning()
          .then((rows) => rows[0] ?? null);
        return row;
      });

      return created ? toWorkspace(created) : null;
    },

    updateWorkspace: async (
      projectId: string,
      workspaceId: string,
      data: UpdateWorkspaceInput,
    ): Promise<ProjectWorkspace | null> => {
      const existing = await db
        .select()
        .from(projectWorkspaces)
        .where(
          and(
            eq(projectWorkspaces.id, workspaceId),
            eq(projectWorkspaces.projectId, projectId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!existing) return null;

      const nextCwd =
        data.cwd !== undefined
          ? normalizeWorkspaceCwd(data.cwd)
          : normalizeWorkspaceCwd(existing.cwd);
      const nextRepoUrl =
        data.repoUrl !== undefined
          ? readNonEmptyString(data.repoUrl)
          : readNonEmptyString(existing.repoUrl);
      const nextSourceType =
        data.sourceType !== undefined
          ? readNonEmptyString(data.sourceType)
          : readNonEmptyString(existing.sourceType);
      const nextRemoteWorkspaceRef =
        data.remoteWorkspaceRef !== undefined
          ? readNonEmptyString(data.remoteWorkspaceRef)
          : readNonEmptyString(existing.remoteWorkspaceRef);
      if (nextSourceType === "remote_managed") {
        if (!nextRemoteWorkspaceRef && !nextRepoUrl) return null;
      } else if (!nextCwd && !nextRepoUrl) {
        return null;
      }

      const patch: Partial<typeof projectWorkspaces.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.name !== undefined) patch.name = deriveWorkspaceName({ name: data.name, cwd: nextCwd, repoUrl: nextRepoUrl });
      if (data.name === undefined && (data.cwd !== undefined || data.repoUrl !== undefined)) {
        patch.name = deriveWorkspaceName({ cwd: nextCwd, repoUrl: nextRepoUrl });
      }
      if (data.cwd !== undefined) patch.cwd = nextCwd ?? null;
      if (data.repoUrl !== undefined) patch.repoUrl = nextRepoUrl ?? null;
      if (data.repoRef !== undefined) patch.repoRef = readNonEmptyString(data.repoRef);
      if (data.sourceType !== undefined && nextSourceType) patch.sourceType = nextSourceType;
      if (data.defaultRef !== undefined) patch.defaultRef = readNonEmptyString(data.defaultRef);
      if (data.visibility !== undefined && readNonEmptyString(data.visibility)) {
        patch.visibility = readNonEmptyString(data.visibility)!;
      }
      if (data.setupCommand !== undefined) patch.setupCommand = readNonEmptyString(data.setupCommand);
      if (data.cleanupCommand !== undefined) patch.cleanupCommand = readNonEmptyString(data.cleanupCommand);
      if (data.remoteProvider !== undefined) patch.remoteProvider = readNonEmptyString(data.remoteProvider);
      if (data.remoteWorkspaceRef !== undefined) patch.remoteWorkspaceRef = nextRemoteWorkspaceRef;
      if (data.sharedWorkspaceKey !== undefined) patch.sharedWorkspaceKey = readNonEmptyString(data.sharedWorkspaceKey);
      if (data.metadata !== undefined || data.runtimeConfig !== undefined) {
        patch.metadata =
          data.runtimeConfig !== undefined
            ? mergeProjectWorkspaceRuntimeConfig(
                data.metadata !== undefined
                  ? (data.metadata as Record<string, unknown> | null | undefined)
                  : ((existing.metadata as Record<string, unknown> | null | undefined) ?? null),
                data.runtimeConfig ?? null,
              )
            : data.metadata;
      }

      const updated = await db.transaction(async (tx) => {
        if (data.isPrimary === true) {
          await tx
            .update(projectWorkspaces)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(projectWorkspaces.companyId, existing.companyId),
                eq(projectWorkspaces.projectId, projectId),
              ),
            );
          patch.isPrimary = true;
        } else if (data.isPrimary === false) {
          patch.isPrimary = false;
        }

        const row = await tx
          .update(projectWorkspaces)
          .set(patch)
          .where(eq(projectWorkspaces.id, workspaceId))
          .returning()
          .then((rows) => rows[0] ?? null);
        if (!row) return null;

        if (row.isPrimary) return row;

        const hasPrimary = await tx
          .select({ id: projectWorkspaces.id })
          .from(projectWorkspaces)
          .where(
            and(
              eq(projectWorkspaces.companyId, row.companyId),
              eq(projectWorkspaces.projectId, row.projectId),
              eq(projectWorkspaces.isPrimary, true),
            ),
          )
          .then((rows) => rows[0] ?? null);

        if (!hasPrimary) {
          const nextPrimaryCandidate = await tx
            .select({ id: projectWorkspaces.id })
            .from(projectWorkspaces)
            .where(
              and(
                eq(projectWorkspaces.companyId, row.companyId),
                eq(projectWorkspaces.projectId, row.projectId),
                eq(projectWorkspaces.id, row.id),
              ),
            )
            .then((rows) => rows[0] ?? null);
          const alternateCandidate = await tx
            .select({ id: projectWorkspaces.id })
            .from(projectWorkspaces)
            .where(
              and(
                eq(projectWorkspaces.companyId, row.companyId),
                eq(projectWorkspaces.projectId, row.projectId),
              ),
            )
            .orderBy(asc(projectWorkspaces.createdAt), asc(projectWorkspaces.id))
            .then((rows) => rows.find((candidate) => candidate.id !== row.id) ?? null);

          await ensureSinglePrimaryWorkspace(tx, {
            companyId: row.companyId,
            projectId: row.projectId,
            keepWorkspaceId: alternateCandidate?.id ?? nextPrimaryCandidate?.id ?? row.id,
          });
          const refreshed = await tx
            .select()
            .from(projectWorkspaces)
            .where(eq(projectWorkspaces.id, row.id))
            .then((rows) => rows[0] ?? row);
          return refreshed;
        }

        return row;
      });

      return updated ? toWorkspace(updated) : null;
    },

    removeWorkspace: async (projectId: string, workspaceId: string): Promise<ProjectWorkspace | null> => {
      const existing = await db
        .select()
        .from(projectWorkspaces)
        .where(
          and(
            eq(projectWorkspaces.id, workspaceId),
            eq(projectWorkspaces.projectId, projectId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!existing) return null;

      const removed = await db.transaction(async (tx) => {
        const row = await tx
          .delete(projectWorkspaces)
          .where(eq(projectWorkspaces.id, workspaceId))
          .returning()
          .then((rows) => rows[0] ?? null);
        if (!row) return null;

        if (!row.isPrimary) return row;

        const next = await tx
          .select()
          .from(projectWorkspaces)
          .where(
            and(
              eq(projectWorkspaces.companyId, row.companyId),
              eq(projectWorkspaces.projectId, row.projectId),
            ),
          )
          .orderBy(asc(projectWorkspaces.createdAt), asc(projectWorkspaces.id))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (next) {
          await ensureSinglePrimaryWorkspace(tx, {
            companyId: row.companyId,
            projectId: row.projectId,
            keepWorkspaceId: next.id,
          });
        }

        return row;
      });

      return removed ? toWorkspace(removed) : null;
    },

    resolveByReference: async (companyId: string, reference: string) => {
      const raw = reference.trim();
      if (raw.length === 0) {
        return { project: null, ambiguous: false } as const;
      }

      if (isUuidLike(raw)) {
        const row = await db
          .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
          .from(projects)
          .where(and(eq(projects.id, raw), eq(projects.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!row) return { project: null, ambiguous: false } as const;
        return {
          project: { id: row.id, companyId: row.companyId, urlKey: deriveProjectUrlKey(row.name, row.id) },
          ambiguous: false,
        } as const;
      }

      const urlKey = normalizeProjectUrlKey(raw);
      if (!urlKey) {
        return { project: null, ambiguous: false } as const;
      }

      const rows = await db
        .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
        .from(projects)
        .where(eq(projects.companyId, companyId));
      const matches = rows.filter((row) => deriveProjectUrlKey(row.name, row.id) === urlKey);
      if (matches.length === 1) {
        const match = matches[0]!;
        return {
          project: { id: match.id, companyId: match.companyId, urlKey: deriveProjectUrlKey(match.name, match.id) },
          ambiguous: false,
        } as const;
      }
      if (matches.length > 1) {
        return { project: null, ambiguous: true } as const;
      }
      return { project: null, ambiguous: false } as const;
    },
  };
}
