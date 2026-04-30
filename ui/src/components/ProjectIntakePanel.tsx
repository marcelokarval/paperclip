import type { Issue, Project, RepositoryDocumentationBaseline } from "@paperclipai/shared";
import { Check, FileSearch, Loader2, MessageSquare, Sparkles, Tags, TicketPlus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "../lib/router";
import { getProjectIntakeModel } from "../lib/project-operating-context";
import { ProjectStaffingPanel } from "./ProjectStaffingPanel";
import { ProjectSuggestedGoalsPanel } from "./ProjectSuggestedGoalsPanel";

type ExecutionContractDraft = {
  packageManager: string;
  installCommand: string;
  verificationCommands: string;
  envHandoff: string;
  designAuthority: string;
};

type ProjectIntakePanelProps = {
  project: Project;
  companyPrefix?: string;
  baselineIssue?: Pick<Issue, "status" | "assigneeAgentId"> | null;
  repositoryBaseline?: RepositoryDocumentationBaseline | null;
  hasBaselineCeoReviewRequest: boolean;
  baselineReviewAgentName?: string | null;
  baselineActionMessage?: string | null;
  isRefreshingBaseline?: boolean;
  isApplyingRecommendations?: boolean;
  isRequestingCeoReview?: boolean;
  isAcceptingRepositoryContext?: boolean;
  isSavingExecutionClarifications?: boolean;
  isMarkingExecutionReady?: boolean;
  onRefreshBaseline?: () => void;
  onCreateOperatorIssue?: () => void;
  onRunAnalyzer?: () => void;
  onApplyRecommendations?: () => void;
  onRequestCeoReview?: () => void;
  onAcceptRepositoryContext?: () => void;
  executionContractDraft: ExecutionContractDraft;
  onExecutionContractDraftChange: (patch: Partial<ExecutionContractDraft>) => void;
  executionContractComplete: boolean;
  onSaveExecutionClarifications?: () => void;
  onMarkExecutionContextReady?: () => void;
  staffingPreview?: Parameters<typeof ProjectStaffingPanel>[0]["preview"];
  staffingPreviewOpen?: boolean;
  onStaffingPreviewOpenChange?: (open: boolean) => void;
  isGeneratingBrief?: boolean;
  isCreatingHiringIssue?: boolean;
  onGenerateBrief?: () => void;
  onCreateHiringIssue?: () => void;
};

function IntakePhaseBadge({ status }: { status: "not_started" | "in_progress" | "completed" }) {
  const className =
    status === "completed"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
      : status === "in_progress"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200"
        : "border-border bg-muted/20 text-muted-foreground";
  const label = status === "completed" ? "Done" : status === "in_progress" ? "Active" : "Pending";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${className}`}>{label}</span>;
}

export function ProjectIntakePanel({
  project,
  companyPrefix,
  baselineIssue,
  repositoryBaseline,
  hasBaselineCeoReviewRequest,
  baselineReviewAgentName,
  baselineActionMessage,
  isRefreshingBaseline = false,
  isApplyingRecommendations = false,
  isRequestingCeoReview = false,
  isAcceptingRepositoryContext = false,
  isSavingExecutionClarifications = false,
  isMarkingExecutionReady = false,
  onRefreshBaseline,
  onCreateOperatorIssue,
  onRunAnalyzer,
  onApplyRecommendations,
  onRequestCeoReview,
  onAcceptRepositoryContext,
  executionContractDraft,
  onExecutionContractDraftChange,
  executionContractComplete,
  onSaveExecutionClarifications,
  onMarkExecutionContextReady,
  staffingPreview,
  staffingPreviewOpen = false,
  onStaffingPreviewOpenChange,
  isGeneratingBrief = false,
  isCreatingHiringIssue = false,
  onGenerateBrief,
  onCreateHiringIssue,
}: ProjectIntakePanelProps) {
  const intake = getProjectIntakeModel({
    project,
    repositoryBaseline,
    baselineIssue,
    hasBaselineCeoReviewRequest,
  });
  if (!intake) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Project Intake becomes available once this project has a workspace or baseline context.
      </div>
    );
  }

  const workspaceHref = intake.workspaceId ? `/projects/${project.urlKey || project.id}/workspaces/${intake.workspaceId}` : null;
  const baselineIssueIdentifier = intake.baselineIssueIdentifier ?? repositoryBaseline?.trackingIssueIdentifier ?? null;
  const baselineIssueHref = companyPrefix && baselineIssueIdentifier ? `/${companyPrefix}/issues/${baselineIssueIdentifier}` : null;
  const repositoryContextAccepted = project.operatingContext?.baselineStatus === "accepted";
  const executionReadiness = project.operatingContext?.executionReadiness ?? "unknown";
  const hasWorkspace = Boolean(intake.workspaceId);
  const hasBaselineIssue = Boolean(repositoryBaseline?.trackingIssueId || repositoryBaseline?.trackingIssueIdentifier || baselineIssueHref);
  const canCreateOperatorIssue = Boolean(onCreateOperatorIssue && hasWorkspace && !repositoryBaseline?.trackingIssueId && !repositoryBaseline?.trackingIssueIdentifier);
  const ceoReviewAlreadyActive = baselineIssue?.status === "in_review" || baselineIssue?.status === "done" || Boolean(baselineIssue?.assigneeAgentId);
  const canRequestCeoReview = Boolean(
    onRequestCeoReview
    && hasBaselineIssue
    && baselineReviewAgentName
    && !hasBaselineCeoReviewRequest
    && !ceoReviewAlreadyActive
    && !repositoryContextAccepted,
  );
  const canAcceptRepositoryContext = Boolean(
    onAcceptRepositoryContext
    && (hasBaselineCeoReviewRequest || baselineIssue?.status === "in_review" || baselineIssue?.status === "done")
    && !repositoryContextAccepted,
  );
  const suggestedLabels = repositoryBaseline?.recommendations?.labels ?? [];
  const acceptedLabels = project.operatingContext?.labelCatalog ?? repositoryBaseline?.acceptedGuidance?.labels ?? [];
  const labelSyncComplete = suggestedLabels.length > 0 && acceptedLabels.length >= suggestedLabels.length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Project Intake</div>
            <h3 className="text-lg font-semibold">Repo-first onboarding</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              This is the primary operator flow for repository intake. Supporting artifacts still live in the workspace,
              configuration, and baseline issue, but the main transitions now happen here.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/70 px-4 py-3 text-sm">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Next step</div>
            <div className="mt-2 font-medium text-foreground">{intake.nextActionLabel}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Phase rail</div>
          <div className="mt-3 space-y-3">
            {intake.phases.map((phase) => (
              <div key={phase.key} className="rounded-xl border border-border/70 bg-background/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-foreground">{phase.label}</div>
                  <IntakePhaseBadge status={phase.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{phase.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Step 1 · Repository context</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Button type="button" variant="outline" disabled={!hasWorkspace || isRefreshingBaseline} onClick={onRefreshBaseline}>
                {isRefreshingBaseline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                Refresh baseline
              </Button>
              <Button type="button" variant="secondary" disabled={!canCreateOperatorIssue || isRefreshingBaseline} onClick={onCreateOperatorIssue}>
                {isRefreshingBaseline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TicketPlus className="mr-2 h-4 w-4" />}
                {hasBaselineIssue ? "Operator issue created" : "Create operator issue"}
              </Button>
              <Button type="button" variant="outline" disabled={!hasWorkspace || isRefreshingBaseline} onClick={onRunAnalyzer}>
                {isRefreshingBaseline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Run AI enrichment
              </Button>
            </div>
            {baselineActionMessage ? <p className="mt-3 text-sm text-muted-foreground">{baselineActionMessage}</p> : null}
            {repositoryBaseline?.summary ? <p className="mt-3 text-sm text-muted-foreground">{repositoryBaseline.summary}</p> : null}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Step 1.5 · Label governance</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Validate and materialize the baseline label catalog before creating implementation issues.
                  These labels also feed `ISSUE_ROUTING.md` for CEO/CTO project work.
                </p>
              </div>
              <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                labelSyncComplete
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200"
              }`}>
                {labelSyncComplete ? "synced" : `${suggestedLabels.length} suggested`}
              </span>
            </div>
            {suggestedLabels.length > 0 ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {suggestedLabels.map((label) => {
                  const accepted = acceptedLabels.some((entry) => entry.name === label.name);
                  return (
                    <div key={label.name} className="rounded-lg border border-border bg-background/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
                          <span className="text-sm font-medium">{label.name}</span>
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {accepted ? "accepted" : label.confidence}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{label.description}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No baseline labels have been generated yet.</p>
            )}
            <div className="mt-4">
              <Button type="button" variant="outline" disabled={!hasWorkspace || suggestedLabels.length === 0 || isApplyingRecommendations} onClick={onApplyRecommendations}>
                {isApplyingRecommendations ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                {labelSyncComplete ? "Resync labels and guidance" : "Sync labels and issue guidance"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Step 2 · CEO review and acceptance</div>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              <p>
                The baseline issue remains the canonical review thread, but the primary review actions now live here.
              </p>
              {baselineReviewAgentName ? (
                <p>CEO reviewer: <span className="font-medium text-foreground">{baselineReviewAgentName}</span></p>
              ) : (
                <p className="text-amber-700">No active CEO agent is available for baseline review.</p>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <Button type="button" variant="secondary" disabled={!canRequestCeoReview || isRequestingCeoReview} onClick={onRequestCeoReview}>
                {isRequestingCeoReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                {hasBaselineCeoReviewRequest ? "CEO review requested" : "Ask CEO to review baseline"}
              </Button>
              <Button type="button" variant="outline" disabled={!canAcceptRepositoryContext || isAcceptingRepositoryContext} onClick={onAcceptRepositoryContext}>
                {isAcceptingRepositoryContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Accept repository context
              </Button>
              {baselineIssueHref ? (
                <Button asChild type="button" variant="ghost">
                  <Link to={baselineIssueHref}>Open baseline issue</Link>
                </Button>
              ) : null}
            </div>
          </div>

          {repositoryContextAccepted ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Optional hardening · Execution clarifications
                </div>
                <span className="inline-flex w-fit rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Does not block CTO staffing
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Optional operator canon for runtime, verification, env, and design authority. Open questions can still travel into the first CTO onboarding.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Package manager / runtime</span>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={executionContractDraft.packageManager}
                    onChange={(event) => onExecutionContractDraftChange({ packageManager: event.target.value })}
                    placeholder="pnpm on Node 22"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Install command</span>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={executionContractDraft.installCommand}
                    onChange={(event) => onExecutionContractDraftChange({ installCommand: event.target.value })}
                    placeholder="pnpm install"
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs text-muted-foreground">Verification commands</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={executionContractDraft.verificationCommands}
                    onChange={(event) => onExecutionContractDraftChange({ verificationCommands: event.target.value })}
                    placeholder={"pnpm -r typecheck\npnpm build"}
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs text-muted-foreground">Env / bootstrap handoff</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={executionContractDraft.envHandoff}
                    onChange={(event) => onExecutionContractDraftChange({ envHandoff: event.target.value })}
                    placeholder="State which env file, secret source, and bootstrap assumptions are canonical."
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs text-muted-foreground">Design authority rule</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={executionContractDraft.designAuthority}
                    onChange={(event) => onExecutionContractDraftChange({ designAuthority: event.target.value })}
                    placeholder="Define whether design-system.contract alone is authoritative or how premium direction is applied."
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-muted-foreground">
                  {executionReadiness === "ready"
                    ? "Execution clarifications are closed. Use this only if you want a tighter operator contract."
                    : "Open clarifications do not block the first CTO. Save them here if you want them passed into the hiring brief explicitly."}
                </p>
                <div className="flex flex-col gap-3 md:flex-row">
                  <Button type="button" variant="outline" disabled={isSavingExecutionClarifications} onClick={onSaveExecutionClarifications}>
                    {isSavingExecutionClarifications ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Save execution clarifications
                  </Button>
                  {executionContractComplete ? (
                    <Button type="button" variant="outline" disabled={isMarkingExecutionReady} onClick={onMarkExecutionContextReady}>
                      {isMarkingExecutionReady ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Mark execution context ready
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <ProjectSuggestedGoalsPanel project={project} />

          <ProjectStaffingPanel
            project={project}
            companyPrefix={companyPrefix ?? null}
            baselineIssueIdentifierFallback={repositoryBaseline?.trackingIssueIdentifier ?? null}
            preview={staffingPreview ?? null}
            previewOpen={staffingPreviewOpen}
            onPreviewOpenChange={onStaffingPreviewOpenChange}
            isGeneratingBrief={isGeneratingBrief}
            isCreatingHiringIssue={isCreatingHiringIssue}
            onGenerateBrief={onGenerateBrief}
            onCreateHiringIssue={onCreateHiringIssue}
          />

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Supporting artifacts</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                <div className="text-sm font-medium text-foreground">Canonical baseline issue</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {baselineIssueHref && intake.baselineIssueIdentifier ? (
                    <Link to={baselineIssueHref} className="hover:underline">
                      {intake.baselineIssueIdentifier}
                    </Link>
                  ) : (
                    intake.baselineIssueIdentifier ?? "Not created yet"
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                <div className="text-sm font-medium text-foreground">Workspace detail</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {workspaceHref && intake.workspaceName ? (
                    <Link to={workspaceHref} className="hover:underline">
                      {intake.workspaceName}
                    </Link>
                  ) : (
                    intake.workspaceName ?? "No workspace linked"
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                <div className="text-sm font-medium text-foreground">Canonical docs</div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {intake.canonicalDocs.length > 0 ? intake.canonicalDocs.slice(0, 4).map((doc) => (
                    <div key={doc} className="font-mono break-all text-xs">{doc}</div>
                  )) : "No canonical docs recorded"}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                <div className="text-sm font-medium text-foreground">Configuration follow-up</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Suggested goals: {intake.suggestedGoalsCount}
                  <div className="mt-2">
                    <Button asChild type="button" variant="ghost" size="sm">
                      <Link to={`/projects/${project.urlKey || project.id}/configuration`}>Open configuration</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
