import type { Agent, Issue, Project, RepositoryDocumentationBaseline } from "@paperclipai/shared";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean),
  )];
}

export interface ProjectOverviewModel {
  summary: string | null;
  stackSummary: string[];
  canonicalDocs: string[];
  topRisks: string[];
  baselineTrackingIssueIdentifier: string | null;
  baselineAcceptedAt: string | null;
}

export interface ProjectStaffingModel {
  recommendedRole: NonNullable<Project["staffingState"]>["recommendedRole"];
  recommendedRoleLabel: string | null;
  status: NonNullable<Project["staffingState"]>["status"];
  statusLabel: string;
  baselineIssueIdentifier: string | null;
  hiringIssueIdentifier: string | null;
  lastBriefGeneratedAt: string | null;
  canGenerateBrief: boolean;
  blockedReason: string | null;
  executionReadiness: Exclude<NonNullable<Project["operatingContext"]>["executionReadiness"], undefined> | "unknown";
  executionClarificationNote: string | null;
}

export interface ProjectIssueContextModel {
  labelCatalog: NonNullable<Project["operatingContext"]>["labelCatalog"];
  canonicalDocs: string[];
  verificationCommands: string[];
  ownershipAreas: NonNullable<Project["operatingContext"]>["ownershipAreas"];
  operatingGuidance: string[];
  labelUsageGuidance: string[];
  parentChildGuidance: string[];
  blockingGuidance: string[];
  reviewGuidance: string[];
  approvalGuidance: string[];
}

export type ProjectIntakePhaseKey =
  | "repository_scan"
  | "ai_enrichment"
  | "label_governance"
  | "ceo_review"
  | "repository_acceptance"
  | "execution_clarifications"
  | "staffing";

export interface ProjectIntakePhaseModel {
  key: ProjectIntakePhaseKey;
  label: string;
  status: "not_started" | "in_progress" | "completed";
  description: string;
}

export interface ProjectIntakeModel {
  currentPhase: ProjectIntakePhaseKey;
  nextActionLabel: string;
  phases: ProjectIntakePhaseModel[];
  baselineIssueIdentifier: string | null;
  workspaceName: string | null;
  workspaceId: string | null;
  canonicalDocs: string[];
  suggestedGoalsCount: number;
  suggestedLabelCount: number;
  acceptedLabelCount: number;
  staffingStatusLabel: string | null;
}

export type ProjectIssueContextInsertKind = "docs" | "verification";

export interface ProjectParticipantSuggestions {
  assigneeAgentId: string | null;
  reviewerValue: string | null;
  approverValue: string | null;
}

const STAFFING_ROLE_LABELS: Record<NonNullable<Project["staffingState"]>["recommendedRole"] & string, string> = {
  cto: "CTO",
  ux: "UX",
  marketing: "Marketing",
  ops: "Ops",
};

const STAFFING_STATUS_LABELS: Record<NonNullable<Project["staffingState"]>["status"], string> = {
  not_started: "Not started",
  brief_generated: "Brief generated",
  issue_created: "Hiring issue created",
  approval_pending: "Approval pending",
  hire_approved: "Hire approved",
  role_onboarded: "Role onboarded",
};

export function getProjectOverviewModel(
  project: Pick<Project, "description" | "operatingContext">,
): ProjectOverviewModel {
  const operatingContext = project.operatingContext ?? null;
  const executivePacket = operatingContext?.executiveProjectPacket ?? null;

  return {
    summary: operatingContext?.overviewSummary?.trim() || project.description?.trim() || null,
    stackSummary: uniqueStrings(executivePacket?.stackSummary ?? []),
    canonicalDocs: uniqueStrings(operatingContext?.canonicalDocs ?? []),
    topRisks: uniqueStrings(executivePacket?.topRisks ?? []),
    baselineTrackingIssueIdentifier: operatingContext?.baselineTrackingIssueIdentifier ?? null,
    baselineAcceptedAt: operatingContext?.baselineAcceptedAt ?? null,
  };
}

export function getProjectStaffingModel(
  project: Pick<Project, "operatingContext" | "staffingState"> | null | undefined,
): ProjectStaffingModel | null {
  if (!project) return null;
  const staffingState = project.staffingState ?? null;
  const recommendedRole = staffingState?.recommendedRole
    ?? project.operatingContext?.executiveProjectPacket?.hiringSignals[0]
    ?? null;
  const baselineIssueIdentifier = staffingState?.baselineIssueIdentifier
    ?? project.operatingContext?.baselineTrackingIssueIdentifier
    ?? null;
  const status = staffingState?.status ?? "not_started";
  const executionReadiness = project.operatingContext?.executionReadiness ?? "unknown";

  if (!recommendedRole && !baselineIssueIdentifier && !staffingState?.hiringIssueIdentifier) return null;

  const canGenerateBrief = Boolean(
    recommendedRole
    && project.operatingContext?.baselineStatus === "accepted"
    && !staffingState?.hiringIssueIdentifier,
  );
  const blockedReason =
    staffingState?.hiringIssueIdentifier
      ? "A hiring issue already exists for this project."
      : project.operatingContext?.baselineStatus !== "accepted"
        ? "Accept repository context before generating a hiring brief."
        : null;
  const executionClarificationNote = executionReadiness !== "ready"
    ? "Open execution questions will be passed into the CTO hiring brief as onboarding clarifications."
    : null;

  return {
    recommendedRole,
    recommendedRoleLabel: recommendedRole ? STAFFING_ROLE_LABELS[recommendedRole] ?? recommendedRole.toUpperCase() : null,
    status,
    statusLabel: STAFFING_STATUS_LABELS[status],
    baselineIssueIdentifier,
    hiringIssueIdentifier: staffingState?.hiringIssueIdentifier ?? null,
    lastBriefGeneratedAt: staffingState?.lastBriefGeneratedAt ?? null,
    canGenerateBrief,
    blockedReason,
    executionReadiness,
    executionClarificationNote,
  };
}

export function getProjectIssueContextModel(
  project: Pick<Project, "issueSystemGuidance" | "operatingContext"> | null | undefined,
): ProjectIssueContextModel | null {
  if (!project) return null;
  const issueGuidance = project.issueSystemGuidance ?? null;
  const operatingContext = project.operatingContext ?? null;

  const model: ProjectIssueContextModel = {
    labelCatalog: operatingContext?.labelCatalog ?? [],
    canonicalDocs: uniqueStrings([
      ...(issueGuidance?.canonicalDocs ?? []),
      ...(operatingContext?.canonicalDocs ?? []),
    ]),
    verificationCommands: uniqueStrings([
      ...(issueGuidance?.suggestedVerificationCommands ?? []),
      ...(operatingContext?.verificationCommands ?? []),
    ]),
    ownershipAreas: operatingContext?.ownershipAreas ?? [],
    operatingGuidance: uniqueStrings(operatingContext?.operatingGuidance ?? []),
    labelUsageGuidance: uniqueStrings(issueGuidance?.labelUsageGuidance ?? []),
    parentChildGuidance: uniqueStrings(issueGuidance?.parentChildGuidance ?? []),
    blockingGuidance: uniqueStrings(issueGuidance?.blockingGuidance ?? []),
    reviewGuidance: uniqueStrings(issueGuidance?.reviewGuidance ?? []),
    approvalGuidance: uniqueStrings(issueGuidance?.approvalGuidance ?? []),
  };

  const hasContent =
    model.labelCatalog.length > 0 ||
    model.canonicalDocs.length > 0 ||
    model.verificationCommands.length > 0 ||
    model.ownershipAreas.length > 0 ||
    model.operatingGuidance.length > 0 ||
    model.labelUsageGuidance.length > 0 ||
    model.parentChildGuidance.length > 0 ||
    model.blockingGuidance.length > 0 ||
    model.reviewGuidance.length > 0 ||
    model.approvalGuidance.length > 0;

  return hasContent ? model : null;
}

export function getProjectIntakeModel(input: {
  project: Pick<Project, "operatingContext" | "staffingState" | "workspaces" | "primaryWorkspace"> | null | undefined;
  repositoryBaseline?: Pick<RepositoryDocumentationBaseline, "trackingIssueId" | "trackingIssueIdentifier" | "recommendations" | "acceptedGuidance"> | null;
  baselineIssue?: Pick<Issue, "status" | "assigneeAgentId"> | null;
  hasBaselineCeoReviewRequest?: boolean;
}): ProjectIntakeModel | null {
  const project = input.project;
  if (!project) return null;

  const operatingContext = project.operatingContext ?? null;
  const staffing = getProjectStaffingModel(project);
  const primaryWorkspace = project.primaryWorkspace ?? project.workspaces[0] ?? null;
  const repositoryBaseline = input.repositoryBaseline ?? null;
  const baselineStatus = operatingContext?.baselineStatus ?? "none";
  const analyzerStatus = primaryWorkspace?.metadata
    && typeof primaryWorkspace.metadata === "object"
    && primaryWorkspace.metadata !== null
    && "repositoryDocumentationBaseline" in primaryWorkspace.metadata
    ? (((primaryWorkspace.metadata as {
      repositoryDocumentationBaseline?: { analysis?: { status?: string | null } | null } | null;
    }).repositoryDocumentationBaseline?.analysis?.status) ?? null)
    : null;
  const baselineIssue = input.baselineIssue ?? null;
  const baselineIssueExists = Boolean(
    baselineIssue || repositoryBaseline?.trackingIssueId || repositoryBaseline?.trackingIssueIdentifier,
  );
  const ceoReviewRequested = input.hasBaselineCeoReviewRequest === true;
  const ceoReviewCompleted = baselineIssue?.status === "in_review" || baselineIssue?.status === "done";
  const ceoReviewInProgress = !ceoReviewCompleted && (ceoReviewRequested || Boolean(baselineIssue?.assigneeAgentId));
  const executionStatus = operatingContext?.executionReadiness ?? "unknown";
  const suggestedLabelCount = input.repositoryBaseline?.recommendations?.labels.length ?? 0;
  const acceptedLabelCount = operatingContext?.labelCatalog.length ?? input.repositoryBaseline?.acceptedGuidance?.labels.length ?? 0;
  const labelGovernanceCompleted = suggestedLabelCount === 0
    ? Boolean(analyzerStatus)
    : acceptedLabelCount >= suggestedLabelCount;
  const labelGovernanceAvailable = Boolean(primaryWorkspace && suggestedLabelCount > 0);

  const phases: ProjectIntakePhaseModel[] = [
    {
      key: "repository_scan",
      label: "Repository scan",
      status: primaryWorkspace ? "completed" : "not_started",
      description: primaryWorkspace
        ? "A project workspace exists and baseline discovery can read repository context."
        : "Create or attach a project workspace so Paperclip can inspect the repository.",
    },
    {
      key: "ai_enrichment",
      label: "AI enrichment",
      status: analyzerStatus ? "completed" : primaryWorkspace ? "in_progress" : "not_started",
      description: analyzerStatus
        ? `AI enrichment recorded analyzer status: ${analyzerStatus}.`
        : "Run AI enrichment to turn the deterministic baseline into richer project context.",
    },
    {
      key: "label_governance",
      label: "Label governance",
      status: labelGovernanceCompleted ? "completed" : labelGovernanceAvailable ? "in_progress" : "not_started",
      description: labelGovernanceCompleted
        ? suggestedLabelCount === 0
          ? "No baseline labels were suggested for this repository context."
          : `${acceptedLabelCount} baseline labels accepted for future issue routing.`
        : labelGovernanceAvailable
          ? "Review and sync the baseline label catalog before creating implementation issues."
          : "Run baseline recommendations before syncing project labels.",
    },
    {
      key: "ceo_review",
      label: "CEO review",
      status: !baselineIssueExists ? "not_started" : ceoReviewCompleted ? "completed" : ceoReviewInProgress ? "in_progress" : "not_started",
      description: !baselineIssueExists
        ? "Create the operator issue first. CEO review starts only after the canonical baseline thread exists."
        : ceoReviewCompleted
          ? "The baseline thread already has CEO review activity."
          : ceoReviewInProgress
            ? "The baseline issue is currently assigned or marked for CEO review."
            : "Request CEO review from Project Intake before accepting repository context.",
    },
    {
      key: "repository_acceptance",
      label: "Repository acceptance",
      status: baselineStatus === "accepted" ? "completed" : baselineIssueExists ? "in_progress" : "not_started",
      description: baselineStatus === "accepted"
        ? "Repository context is accepted and available to staffing."
        : "Accept repository context from Project Intake once the CEO review is satisfactory.",
    },
    {
      key: "execution_clarifications",
      label: "Execution clarifications",
      status: executionStatus === "ready" ? "completed" : baselineStatus === "accepted" ? "in_progress" : "not_started",
      description: executionStatus === "ready"
        ? "Optional runtime, verification, env, and design clarifications are closed."
        : "Optional clarifications remain open and can travel into the first CTO onboarding.",
    },
    {
      key: "staffing",
      label: "Staffing",
      status: staffing?.status && staffing.status !== "not_started" ? "completed" : baselineStatus === "accepted" ? "in_progress" : "not_started",
      description: staffing?.status && staffing.status !== "not_started"
        ? `Staffing has started: ${staffing.statusLabel}.`
        : "Generate the CTO hiring brief once repository context is accepted.",
    },
  ];

  const currentPhase = phases.find((phase) => phase.status !== "completed")?.key ?? "staffing";
  const nextActionLabel =
    currentPhase === "repository_scan"
      ? "Open workspace details"
      : currentPhase === "ai_enrichment"
        ? "Run AI enrichment from the workspace"
        : currentPhase === "label_governance"
          ? "Sync labels and issue guidance from Project Intake"
        : currentPhase === "ceo_review"
          ? !baselineIssueExists
            ? "Create the operator issue from Project Intake"
            : ceoReviewCompleted
              ? "Accept repository context from Project Intake"
              : ceoReviewInProgress
                ? "Wait for CEO review on the baseline issue"
                : "Ask CEO to review baseline from Project Intake"
          : currentPhase === "repository_acceptance"
            ? "Accept repository context from Project Intake"
            : currentPhase === "execution_clarifications"
              ? "Review optional execution clarifications or continue to staffing"
              : "Open staffing to generate the CTO hiring brief";

  return {
    currentPhase,
    nextActionLabel,
    phases,
    baselineIssueIdentifier:
      operatingContext?.baselineTrackingIssueIdentifier
      ?? repositoryBaseline?.trackingIssueIdentifier
      ?? null,
    workspaceName: primaryWorkspace?.name ?? null,
    workspaceId: primaryWorkspace?.id ?? null,
    canonicalDocs: uniqueStrings(operatingContext?.canonicalDocs ?? []),
    suggestedGoalsCount: operatingContext?.suggestedGoals.length ?? 0,
    suggestedLabelCount,
    acceptedLabelCount,
    staffingStatusLabel: staffing?.statusLabel ?? null,
  };
}

export function appendProjectIssueContextSnippet(
  description: string,
  context: ProjectIssueContextModel | null | undefined,
  kind: ProjectIssueContextInsertKind,
): string {
  if (!context) return description;
  const normalizedDescription = description.trim();

  if (kind === "docs") {
    if (context.canonicalDocs.length === 0) return description;
    const snippet = [
      "## Canonical docs",
      ...context.canonicalDocs.map((entry) => `- \`${entry}\``),
    ].join("\n");
    if (normalizedDescription.includes("## Canonical docs")) return description;
    return normalizedDescription ? `${normalizedDescription}\n\n${snippet}` : snippet;
  }

  if (context.verificationCommands.length === 0) return description;
  const snippet = [
    "## Verification",
    ...context.verificationCommands.map((entry) => `- [ ] \`${entry}\``),
  ].join("\n");
  if (normalizedDescription.includes("## Verification")) return description;
  return normalizedDescription ? `${normalizedDescription}\n\n${snippet}` : snippet;
}

export function getProjectParticipantSuggestions(
  project: Pick<Project, "issueSystemGuidance" | "operatingContext"> | null | undefined,
  agents: Agent[] | null | undefined,
): ProjectParticipantSuggestions | null {
  if (!project || !agents?.length) return null;

  const activeAgents = agents.filter((agent) => agent.status !== "terminated");
  const ceo = activeAgents.find((agent) => agent.role === "ceo") ?? null;
  const cto = activeAgents.find((agent) => agent.role === "cto") ?? null;
  const qa = activeAgents.find((agent) => agent.role === "qa") ?? null;
  const context = getProjectIssueContextModel(project);
  const technicalPacket = project.operatingContext?.technicalProjectPacket ?? null;

  const hasTechnicalSurface = Boolean(
    technicalPacket
    || context?.verificationCommands.length
    || context?.ownershipAreas.length,
  );
  const hasApprovalGuidance = Boolean(context?.approvalGuidance.length);

  const suggestions: ProjectParticipantSuggestions = {
    assigneeAgentId: hasTechnicalSurface ? (cto?.id ?? null) : null,
    reviewerValue: context?.reviewGuidance.length || context?.verificationCommands.length
      ? (qa ? `agent:${qa.id}` : cto ? `agent:${cto.id}` : null)
      : null,
    approverValue: hasApprovalGuidance && ceo ? `agent:${ceo.id}` : null,
  };

  return suggestions.assigneeAgentId || suggestions.reviewerValue || suggestions.approverValue
    ? suggestions
    : null;
}

export function buildProjectDescriptionPatch(project: Project, description: string | null): Record<string, unknown> {
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  const nextDescription = normalizedDescription.length > 0 ? normalizedDescription : null;
  const operatingContext = project.operatingContext;
  if (!operatingContext) {
    return { description: nextDescription };
  }

  const suggestion = operatingContext.configurationDescriptionSuggestion?.trim() || null;
  const nextDescriptionSource =
    !nextDescription
      ? "none"
      : suggestion && nextDescription === suggestion
        ? "baseline"
        : "manual";

  return {
    description: nextDescription,
    operatingContext: {
      ...operatingContext,
      descriptionSource: nextDescriptionSource,
    },
  };
}

export function buildUseBaselineDescriptionSuggestionPatch(project: Project): Record<string, unknown> | null {
  const suggestion = project.operatingContext?.configurationDescriptionSuggestion?.trim() || null;
  if (!suggestion) return null;

  return {
    description: suggestion,
    operatingContext: {
      ...project.operatingContext,
      descriptionSource: "baseline",
    },
  };
}

export function buildKeepManualDescriptionPatch(project: Project): Record<string, unknown> | null {
  if (!project.operatingContext) return null;
  return {
    description: project.description?.trim() || null,
    operatingContext: {
      ...project.operatingContext,
      descriptionSource: project.description?.trim() ? "manual" : "none",
    },
  };
}
