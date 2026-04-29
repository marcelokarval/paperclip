import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Link, useParams, useNavigate, useLocation, Navigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PROJECT_COLORS, isUuidLike, type BudgetPolicySummary, type ExecutionWorkspace, type Project } from "@paperclipai/shared";
import { budgetsApi } from "../api/budgets";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { instanceSettingsApi } from "../api/instanceSettings";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ProjectProperties, type ProjectConfigFieldKey, type ProjectFieldSaveState } from "../components/ProjectProperties";
import { InlineEditor } from "../components/InlineEditor";
import { StatusBadge } from "../components/StatusBadge";
import { BudgetPolicyCard } from "../components/BudgetPolicyCard";
import { ExecutionWorkspaceCloseDialog } from "../components/ExecutionWorkspaceCloseDialog";
import { IssuesList } from "../components/IssuesList";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { ProjectWorkspaceSummaryCard } from "../components/ProjectWorkspaceSummaryCard";
import { buildProjectWorkspaceSummaries } from "../lib/project-workspaces-tab";
import { readRepositoryDocumentationBaseline } from "../lib/repository-documentation-baseline";
import {
  buildBaselineCeoReviewRequestComment,
  buildRepositoryBaselineReviewFingerprint,
  buildExecutionContractDraft,
  isExecutionContractComplete,
  normalizeExecutionContractCommands,
  normalizeExecutionContractText,
  readBaselineReviewRequestPresentForFingerprint,
  readBaselineReviewResponsePresentForFingerprint,
} from "../lib/repository-baseline-actions";
import { projectRouteRef } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import { getProjectOverviewModel } from "../lib/project-operating-context";
import { ProjectIntakePanel } from "../components/ProjectIntakePanel";
import { ProjectStaffingPanel } from "../components/ProjectStaffingPanel";

/* ── Top-level tab types ── */

type ProjectBaseTab = "overview" | "list" | "workspaces" | "intake" | "configuration" | "budget";
type ProjectPluginTab = `plugin:${string}`;
type ProjectTab = ProjectBaseTab | ProjectPluginTab;

function isProjectPluginTab(value: string | null): value is ProjectPluginTab {
  return typeof value === "string" && value.startsWith("plugin:");
}

function resolveProjectTab(pathname: string, projectId: string): ProjectTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1 || segments[projectsIdx + 1] !== projectId) return null;
  const tab = segments[projectsIdx + 2];
  if (tab === "overview") return "overview";
  if (tab === "intake") return "intake";
  if (tab === "configuration") return "configuration";
  if (tab === "budget") return "budget";
  if (tab === "issues") return "list";
  if (tab === "workspaces") return "workspaces";
  return null;
}

/* ── Overview tab content ── */

function OverviewContent({
  project,
  companyPrefix,
}: {
  project: Pick<Project, "description" | "status" | "targetDate" | "operatingContext">;
  companyPrefix?: string;
}) {
  const overview = getProjectOverviewModel(project);
  const trackingIssueHref = companyPrefix && overview.baselineTrackingIssueIdentifier
    ? `/${companyPrefix}/issues/${overview.baselineTrackingIssueIdentifier}`
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {overview.summary ?? "No overview is available yet."}
        </p>
        {project.description?.trim() && project.description.trim() !== overview.summary ? (
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Manual description</div>
            <p className="mt-1 text-xs text-muted-foreground">{project.description}</p>
          </div>
        ) : null}
      </div>

      {(overview.stackSummary.length > 0 || overview.canonicalDocs.length > 0 || overview.topRisks.length > 0 || trackingIssueHref || overview.baselineAcceptedAt) ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {overview.stackSummary.length > 0 ? (
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Stack signals</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {overview.stackSummary.map((item) => (
                  <span key={item} className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {overview.canonicalDocs.length > 0 ? (
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Canonical docs</div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {overview.canonicalDocs.slice(0, 6).map((doc) => (
                  <div key={doc} className="font-mono break-all">{doc}</div>
                ))}
              </div>
            </div>
          ) : null}

          {overview.topRisks.length > 0 ? (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-amber-800 dark:text-amber-200">Top risks</div>
              <ul className="mt-2 space-y-1 text-xs text-amber-900 dark:text-amber-100">
                {overview.topRisks.slice(0, 4).map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {(trackingIssueHref || overview.baselineAcceptedAt) ? (
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Baseline</div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {trackingIssueHref && overview.baselineTrackingIssueIdentifier ? (
                  <Link to={trackingIssueHref} className="hover:underline">
                    {overview.baselineTrackingIssueIdentifier}
                  </Link>
                ) : null}
                {overview.baselineAcceptedAt ? (
                  <div>Accepted {overview.baselineAcceptedAt}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Status</span>
          <div className="mt-1">
            <StatusBadge status={project.status} />
          </div>
        </div>
        {project.targetDate && (
          <div>
            <span className="text-muted-foreground">Target Date</span>
            <p>{project.targetDate}</p>
          </div>
        )}
      </div>

      <ProjectStaffingPanel project={project} companyPrefix={companyPrefix ?? null} />
    </div>
  );
}

function shouldDefaultProjectRouteToIntake(project: Project | null | undefined) {
  if (!project) return false;
  return Boolean(
    project.primaryWorkspace
    || project.workspaces.length > 0
    || project.operatingContext
    || project.staffingState,
  );
}

/* ── Color picker popover ── */

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 h-5 w-5 rounded-md cursor-pointer hover:ring-2 hover:ring-foreground/20 transition-[box-shadow]"
        style={{ backgroundColor: currentColor }}
        aria-label="Change project color"
      />
      {open && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-popover border border-border rounded-lg shadow-lg z-50 w-max">
          <div className="grid grid-cols-5 gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-md cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-110 ${
                  color === currentColor
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:ring-2 hover:ring-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── List (issues) tab content ── */

function ProjectIssuesList({ projectId, companyId }: { projectId: string; companyId: string }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      projects={projects}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey="paperclip:project-issues-view"
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
    />
  );
}

function ProjectWorkspacesContent({
  companyId,
  projectId,
  projectRef,
  summaries,
}: {
  companyId: string;
  projectId: string;
  projectRef: string;
  summaries: ReturnType<typeof buildProjectWorkspaceSummaries>;
}) {
  const queryClient = useQueryClient();
  const [runtimeActionKey, setRuntimeActionKey] = useState<string | null>(null);
  const [closingWorkspace, setClosingWorkspace] = useState<{
    id: string;
    name: string;
    status: ExecutionWorkspace["status"];
  } | null>(null);
  const controlWorkspaceRuntime = useMutation({
    mutationFn: async (input: {
      key: string;
      kind: "project_workspace" | "execution_workspace";
      workspaceId: string;
      action: "start" | "stop" | "restart";
    }) => {
      setRuntimeActionKey(`${input.key}:${input.action}`);
      if (input.kind === "project_workspace") {
        return await projectsApi.controlWorkspaceRuntimeServices(projectId, input.workspaceId, input.action, companyId);
      }
      return await executionWorkspacesApi.controlRuntimeServices(input.workspaceId, input.action);
    },
    onSettled: () => {
      setRuntimeActionKey(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.list(companyId, { projectId }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
    },
  });

  if (summaries.length === 0) {
    return <p className="text-sm text-muted-foreground">No non-default workspace activity yet.</p>;
  }

  const activeSummaries = summaries.filter((summary) => summary.executionWorkspaceStatus !== "cleanup_failed");
  const cleanupFailedSummaries = summaries.filter((summary) => summary.executionWorkspaceStatus === "cleanup_failed");

  return (
    <>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {activeSummaries.map((summary) => (
            <ProjectWorkspaceSummaryCard
              key={summary.key}
              projectRef={projectRef}
              summary={summary}
              runtimeActionKey={runtimeActionKey}
              runtimeActionPending={controlWorkspaceRuntime.isPending}
              onRuntimeAction={(input) => controlWorkspaceRuntime.mutate(input)}
              onCloseWorkspace={(input) => setClosingWorkspace(input)}
            />
          ))}
        </div>
        {cleanupFailedSummaries.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Cleanup attention needed
            </div>
            <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5">
              {cleanupFailedSummaries.map((summary) => (
                <ProjectWorkspaceSummaryCard
                  key={summary.key}
                  projectRef={projectRef}
                  summary={summary}
                  runtimeActionKey={runtimeActionKey}
                  runtimeActionPending={controlWorkspaceRuntime.isPending}
                  onRuntimeAction={(input) => controlWorkspaceRuntime.mutate(input)}
                  onCloseWorkspace={(input) => setClosingWorkspace(input)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {closingWorkspace ? (
        <ExecutionWorkspaceCloseDialog
          workspaceId={closingWorkspace.id}
          workspaceName={closingWorkspace.name}
          currentStatus={closingWorkspace.status}
          open
          onOpenChange={(open) => {
            if (!open) setClosingWorkspace(null);
          }}
          onClosed={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.list(companyId, { projectId }) });
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
            setClosingWorkspace(null);
          }}
        />
      ) : null}
    </>
  );
}

/* ── Main project page ── */

export function ProjectDetail() {
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [fieldSaveStates, setFieldSaveStates] = useState<Partial<Record<ProjectConfigFieldKey, ProjectFieldSaveState>>>({});
  const [baselineActionMessage, setBaselineActionMessage] = useState<string | null>(null);
  const [staffingPreviewOpen, setStaffingPreviewOpen] = useState(false);
  const [executionContractDraft, setExecutionContractDraft] = useState({
    packageManager: "",
    installCommand: "",
    verificationCommands: "",
    envHandoff: "",
    designAuthority: "",
  });
  const fieldSaveRequestIds = useRef<Partial<Record<ProjectConfigFieldKey, number>>>({});
  const fieldSaveTimers = useRef<Partial<Record<ProjectConfigFieldKey, ReturnType<typeof setTimeout>>>>({});
  const routeProjectRef = projectId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));
  const activeRouteTab = routeProjectRef ? resolveProjectTab(location.pathname, routeProjectRef) : null;
  const pluginTabFromSearch = useMemo(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return isProjectPluginTab(tab) ? tab : null;
  }, [location.search]);
  const activeTab = activeRouteTab ?? pluginTabFromSearch;

  const { data: project, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const primaryWorkspace = project?.primaryWorkspace ?? project?.workspaces[0] ?? null;
  const primaryWorkspaceId = primaryWorkspace?.id ?? null;
  const repositoryBaseline = readRepositoryDocumentationBaseline(primaryWorkspace?.metadata);
  const baselineIssueId =
    project?.operatingContext?.baselineTrackingIssueId
    ?? repositoryBaseline?.trackingIssueId
    ?? null;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;
  const experimentalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    retry: false,
  });
  const {
    slots: pluginDetailSlots,
    isLoading: pluginDetailSlotsLoading,
  } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "project",
    companyId: resolvedCompanyId,
    enabled: !!resolvedCompanyId,
  });
  const pluginTabItems = useMemo(
    () => pluginDetailSlots.map((slot) => ({
      value: `plugin:${slot.pluginKey}:${slot.id}` as ProjectPluginTab,
      label: slot.displayName,
      slot,
    })),
    [pluginDetailSlots],
  );
  const activePluginTab = pluginTabItems.find((item) => item.value === activeTab) ?? null;
  const isolatedWorkspacesEnabled = experimentalSettingsQuery.data?.enableIsolatedWorkspaces === true;
  const workspaceTabProjectId = project?.id ?? null;
  const { data: workspaceTabIssues = [], isLoading: isWorkspaceTabIssuesLoading, error: workspaceTabIssuesError } = useQuery({
    queryKey: workspaceTabProjectId && resolvedCompanyId
      ? queryKeys.issues.listByProject(resolvedCompanyId, workspaceTabProjectId)
      : ["issues", "__workspace-tab__", "disabled"],
    queryFn: () => issuesApi.list(resolvedCompanyId!, { projectId: workspaceTabProjectId! }),
    enabled: Boolean(resolvedCompanyId && workspaceTabProjectId && isolatedWorkspacesEnabled),
  });
  const {
    data: workspaceTabExecutionWorkspaces = [],
    isLoading: isWorkspaceTabExecutionWorkspacesLoading,
    error: workspaceTabExecutionWorkspacesError,
  } = useQuery({
    queryKey: workspaceTabProjectId && resolvedCompanyId
      ? queryKeys.executionWorkspaces.list(resolvedCompanyId, { projectId: workspaceTabProjectId })
      : ["execution-workspaces", "__workspace-tab__", "disabled"],
    queryFn: () => executionWorkspacesApi.list(resolvedCompanyId!, { projectId: workspaceTabProjectId! }),
    enabled: Boolean(resolvedCompanyId && workspaceTabProjectId && isolatedWorkspacesEnabled),
  });
  const workspaceSummaries = useMemo(() => {
    if (!project || !isolatedWorkspacesEnabled) return [];
    return buildProjectWorkspaceSummaries({
      project,
      issues: workspaceTabIssues,
      executionWorkspaces: workspaceTabExecutionWorkspaces,
    });
  }, [project, isolatedWorkspacesEnabled, workspaceTabIssues, workspaceTabExecutionWorkspaces]);
  const showWorkspacesTab = isolatedWorkspacesEnabled && workspaceSummaries.length > 0;
  const workspaceTabDecisionLoaded =
    experimentalSettingsQuery.isFetched &&
    (!isolatedWorkspacesEnabled || (!isWorkspaceTabIssuesLoading && !isWorkspaceTabExecutionWorkspacesLoading));
  const workspaceTabError = (workspaceTabIssuesError ?? workspaceTabExecutionWorkspacesError) as Error | null;

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    setSelectedCompanyId(project.companyId, { source: "route_sync" });
  }, [project?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
    }
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: invalidateProject,
  });

  const refreshRepositoryBaseline = useMutation({
    mutationFn: (request: { createTrackingIssue?: boolean; runAnalyzer?: boolean } = {}) => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Project Intake requires a primary workspace.");
      return projectsApi.refreshRepositoryBaseline(project.id, primaryWorkspaceId, resolvedCompanyId ?? lookupCompanyId, request);
    },
    onSuccess: (result) => {
      invalidateProject();
      const trackingIssue = result.trackingIssue ?? null;
      setBaselineActionMessage(
        trackingIssue
          ? `Repository baseline ${result.baseline.status}. Operator issue ${trackingIssue.identifier ?? trackingIssue.id} is linked.`
          : `Repository baseline ${result.baseline.status}.`,
      );
      if (trackingIssue && project?.companyId && project.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(project.companyId, project.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(project.companyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(trackingIssue.id) });
      }
      pushToast({ title: "Repository baseline refreshed", tone: "success" });
    },
    onError: (error) => {
      setBaselineActionMessage(null);
      pushToast({
        title: "Repository baseline failed",
        body: error instanceof Error ? error.message : "Failed to refresh repository baseline.",
        tone: "error",
      });
    },
  });

  const applyRepositoryBaselineRecommendations = useMutation({
    mutationFn: () => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Project Intake requires a primary workspace.");
      return projectsApi.applyRepositoryBaselineRecommendations(project.id, primaryWorkspaceId, resolvedCompanyId ?? lookupCompanyId, {
        applyLabels: true,
        acceptIssueGuidance: true,
      });
    },
    onSuccess: (result) => {
      invalidateProject();
      if (project?.companyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(project.companyId) });
      }
      setBaselineActionMessage(
        `Repository baseline recommendations applied. Created ${result.labels.created.length} labels; ${result.labels.existing.length} already existed. Repository context acceptance is still a separate operator step.`,
      );
      pushToast({ title: "Recommendations applied", tone: "success" });
    },
    onError: (error) => {
      setBaselineActionMessage(null);
      pushToast({
        title: "Recommendation apply failed",
        body: error instanceof Error ? error.message : "Failed to apply repository baseline recommendations.",
        tone: "error",
      });
    },
  });

  const requestBaselineCeoReview = useMutation({
    mutationFn: () => {
      if (!baselineIssueId || !baselineIssue || !repositoryBaseline || !baselineReviewAgent) {
        throw new Error("CEO review requires a baseline issue, repository baseline, and an active CEO agent.");
      }
      return issuesApi.update(baselineIssueId, {
        comment: buildBaselineCeoReviewRequestComment({
          baselineIssue,
          summary: repositoryBaseline.summary,
          stack: repositoryBaseline.stack,
          documentationFiles: repositoryBaseline.documentationFiles,
          guardrails: repositoryBaseline.guardrails,
          reviewFingerprint: baselineReviewFingerprint,
        }),
        assigneeAgentId: baselineReviewAgent.id,
        assigneeUserId: null,
        ...(baselineIssue.status === "backlog" || baselineIssue.status === "done" || baselineIssue.status === "cancelled"
          ? { status: "todo" }
          : {}),
      });
    },
    onSuccess: () => {
      if (baselineIssueId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(baselineIssueId) });
        queryClient.invalidateQueries({ queryKey: ["issues", baselineIssueId, "comments-preview"] });
      }
      if (project?.companyId && project.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(project.companyId, project.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(project.companyId) });
      }
      pushToast({
        title: "CEO review requested",
        body: baselineReviewAgent ? `Commented on the baseline issue and assigned it to ${baselineReviewAgent.name}.` : undefined,
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "CEO review request failed",
        body: error instanceof Error ? error.message : "Unable to request CEO review.",
        tone: "error",
      });
    },
  });

  const acceptRepositoryBaseline = useMutation({
    mutationFn: () => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Repository acceptance requires a linked project workspace.");
      return projectsApi.acceptRepositoryBaseline(project.id, primaryWorkspaceId, { acceptIssueGuidance: true }, resolvedCompanyId ?? lookupCompanyId);
    },
    onSuccess: () => {
      invalidateProject();
      if (baselineIssueId) queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(baselineIssueId) });
      pushToast({
        title: "Repository context accepted",
        body: "Paperclip recorded the baseline as accepted repository context. The next primary step is staffing; execution clarifications remain optional hardening.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Baseline acceptance failed",
        body: error instanceof Error ? error.message : "Unable to accept repository context.",
        tone: "error",
      });
    },
  });

  const saveExecutionContract = useMutation({
    mutationFn: () => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Execution clarifications require a linked project workspace.");
      return projectsApi.updateExecutionContract(
        project.id,
        primaryWorkspaceId,
        {
          packageManager: normalizeExecutionContractText(executionContractDraft.packageManager),
          installCommand: normalizeExecutionContractText(executionContractDraft.installCommand),
          verificationCommands: normalizeExecutionContractCommands(executionContractDraft.verificationCommands),
          envHandoff: normalizeExecutionContractText(executionContractDraft.envHandoff),
          designAuthority: normalizeExecutionContractText(executionContractDraft.designAuthority),
        },
        resolvedCompanyId ?? lookupCompanyId,
      );
    },
    onSuccess: () => {
      invalidateProject();
      pushToast({
        title: "Execution clarifications saved",
        body: "Paperclip updated the operator-side execution contract for this repository.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Execution clarifications failed",
        body: error instanceof Error ? error.message : "Unable to save execution clarifications.",
        tone: "error",
      });
    },
  });

  const markExecutionContextReady = useMutation({
    mutationFn: () => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Execution readiness requires a linked project workspace.");
      return projectsApi.markExecutionContextReady(project.id, primaryWorkspaceId, { ready: true }, resolvedCompanyId ?? lookupCompanyId);
    },
    onSuccess: () => {
      invalidateProject();
      pushToast({
        title: "Execution context ready",
        body: "Staffing can now proceed with a tighter operator contract.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Execution readiness failed",
        body: error instanceof Error ? error.message : "Unable to mark execution context ready.",
        tone: "error",
      });
    },
  });

  const previewHiringBrief = useMutation({
    mutationFn: () => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Project Intake requires a primary workspace.");
      return projectsApi.previewHiringBrief(project.id, primaryWorkspaceId, { role: "cto" }, resolvedCompanyId ?? lookupCompanyId);
    },
    onSuccess: () => {
      setStaffingPreviewOpen(true);
    },
    onError: (error) => {
      setStaffingPreviewOpen(false);
      pushToast({
        title: "Hiring brief failed",
        body: error instanceof Error ? error.message : "Failed to generate hiring brief preview.",
        tone: "error",
      });
    },
  });

  const createHiringIssue = useMutation({
    mutationFn: () => {
      if (!project?.id || !primaryWorkspaceId) throw new Error("Project Intake requires a primary workspace.");
      return projectsApi.createHiringIssue(project.id, primaryWorkspaceId, { role: "cto" }, resolvedCompanyId ?? lookupCompanyId);
    },
    onSuccess: (result) => {
      invalidateProject();
      if (project?.companyId && project.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(project.companyId, project.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(project.companyId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(result.issue.id) });
      setStaffingPreviewOpen(false);
      const issueRef = result.issue.identifier ?? result.issue.id;
      navigate(companyPrefix ? `/${companyPrefix}/issues/${issueRef}` : `/issues/${issueRef}`);
    },
    onError: (error) => {
      pushToast({
        title: "Hiring issue failed",
        body: error instanceof Error ? error.message : "Failed to create hiring issue.",
        tone: "error",
      });
    },
  });

  const archiveProject = useMutation({
    mutationFn: (archived: boolean) =>
      projectsApi.update(
        projectLookupRef,
        { archivedAt: archived ? new Date().toISOString() : null },
        resolvedCompanyId ?? lookupCompanyId,
      ),
    onSuccess: (updatedProject, archived) => {
      invalidateProject();
      const name = updatedProject?.name ?? project?.name ?? "Project";
      if (archived) {
        pushToast({ title: `"${name}" has been archived`, tone: "success" });
        navigate("/dashboard");
      } else {
        pushToast({ title: `"${name}" has been unarchived`, tone: "success" });
      }
    },
    onError: (_, archived) => {
      pushToast({
        title: archived ? "Failed to archive project" : "Failed to unarchive project",
        tone: "error",
      });
    },
  });

  const { data: budgetOverview } = useQuery({
    queryKey: queryKeys.budgets.overview(resolvedCompanyId ?? "__none__"),
    queryFn: () => budgetsApi.overview(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
  const { data: baselineIssue } = useQuery({
    queryKey: baselineIssueId ? queryKeys.issues.detail(baselineIssueId) : ["issues", "detail", "__none__"],
    queryFn: () => issuesApi.get(baselineIssueId!),
    enabled: Boolean(baselineIssueId),
  });
  const { data: baselineComments = [] } = useQuery({
    queryKey: baselineIssueId ? ["issues", baselineIssueId, "comments-preview"] : ["issues", "comments-preview", "__none__"],
    queryFn: () => issuesApi.listComments(baselineIssueId!, { limit: 100, order: "desc" }),
    enabled: Boolean(baselineIssueId),
  });
  const { data: projectAgents = [] } = useQuery({
    queryKey: resolvedCompanyId ? queryKeys.agents.list(resolvedCompanyId) : ["agents", "__none__"],
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: Boolean(resolvedCompanyId),
  });
  const baselineReviewAgent = useMemo(
    () =>
      projectAgents.find((agent) => agent.status !== "terminated" && agent.role === "ceo")
      ?? projectAgents.find((agent) => agent.status !== "terminated" && agent.name.trim().toLowerCase() === "ceo")
      ?? null,
    [projectAgents],
  );
  const repositoryContextAccepted = project?.operatingContext?.baselineStatus === "accepted";
  const persistedExecutionContract = project?.operatingContext?.executionContract ?? null;
  const executionContractComplete = isExecutionContractComplete(persistedExecutionContract);
  const baselineReviewFingerprint = useMemo(
    () => buildRepositoryBaselineReviewFingerprint({ project, baseline: repositoryBaseline }),
    [project, repositoryBaseline],
  );
  const hasBaselineCeoReviewRequest = useMemo(
    () => readBaselineReviewRequestPresentForFingerprint(baselineComments, baselineReviewFingerprint),
    [baselineComments, baselineReviewFingerprint],
  );
  const hasCompletedBaselineCeoReview = useMemo(
    () => readBaselineReviewResponsePresentForFingerprint(baselineComments, baselineReviewFingerprint),
    [baselineComments, baselineReviewFingerprint],
  );

  useEffect(() => {
    setExecutionContractDraft(buildExecutionContractDraft(persistedExecutionContract));
  }, [
    persistedExecutionContract?.packageManager,
    persistedExecutionContract?.installCommand,
    persistedExecutionContract?.verificationCommands,
    persistedExecutionContract?.envHandoff,
    persistedExecutionContract?.designAuthority,
  ]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? "Project" },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef]);

  useEffect(() => {
    if (!project) return;
    if (routeProjectRef === canonicalProjectRef) return;
    if (isProjectPluginTab(activeTab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(activeTab)}`, { replace: true });
      return;
    }
    if (activeTab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`, { replace: true });
      return;
    }
    if (activeTab === "intake") {
      navigate(`/projects/${canonicalProjectRef}/intake`, { replace: true });
      return;
    }
    if (activeTab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`, { replace: true });
      return;
    }
    if (activeTab === "budget") {
      navigate(`/projects/${canonicalProjectRef}/budget`, { replace: true });
      return;
    }
    if (activeTab === "workspaces") {
      navigate(`/projects/${canonicalProjectRef}/workspaces`, { replace: true });
      return;
    }
    if (activeTab === "list") {
      if (filter) {
        navigate(`/projects/${canonicalProjectRef}/issues/${filter}`, { replace: true });
        return;
      }
      navigate(`/projects/${canonicalProjectRef}/issues`, { replace: true });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, activeTab, filter, navigate]);

  useEffect(() => {
    closePanel();
    return () => closePanel();
  }, [closePanel]);

  useEffect(() => {
    return () => {
      Object.values(fieldSaveTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const setFieldState = useCallback((field: ProjectConfigFieldKey, state: ProjectFieldSaveState) => {
    setFieldSaveStates((current) => ({ ...current, [field]: state }));
  }, []);

  const scheduleFieldReset = useCallback((field: ProjectConfigFieldKey, delayMs: number) => {
    const existing = fieldSaveTimers.current[field];
    if (existing) clearTimeout(existing);
    fieldSaveTimers.current[field] = setTimeout(() => {
      setFieldSaveStates((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      delete fieldSaveTimers.current[field];
    }, delayMs);
  }, []);

  const updateProjectField = useCallback(async (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
    const requestId = (fieldSaveRequestIds.current[field] ?? 0) + 1;
    fieldSaveRequestIds.current[field] = requestId;
    setFieldState(field, "saving");
    try {
      await projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId);
      invalidateProject();
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "saved");
      scheduleFieldReset(field, 1800);
    } catch (error) {
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "error");
      scheduleFieldReset(field, 3000);
      throw error;
    }
  }, [invalidateProject, lookupCompanyId, projectLookupRef, resolvedCompanyId, scheduleFieldReset, setFieldState]);

  const projectBudgetSummary = useMemo(() => {
    const matched = budgetOverview?.policies.find(
      (policy) => policy.scopeType === "project" && policy.scopeId === (project?.id ?? routeProjectRef),
    );
    if (matched) return matched;
    return {
      policyId: "",
      companyId: resolvedCompanyId ?? "",
      scopeType: "project",
      scopeId: project?.id ?? routeProjectRef,
      scopeName: project?.name ?? "Project",
      metric: "billed_cents",
      windowKind: "lifetime",
      amount: 0,
      observedAmount: 0,
      remainingAmount: 0,
      utilizationPercent: 0,
      warnPercent: 80,
      hardStopEnabled: true,
      notifyEnabled: true,
      isActive: false,
      status: "ok",
      paused: Boolean(project?.pausedAt),
      pauseReason: project?.pauseReason ?? null,
      windowStart: new Date(),
      windowEnd: new Date(),
    } satisfies BudgetPolicySummary;
  }, [budgetOverview?.policies, project, resolvedCompanyId, routeProjectRef]);

  const budgetMutation = useMutation({
    mutationFn: (amount: number) =>
      budgetsApi.upsertPolicy(resolvedCompanyId!, {
        scopeType: "project",
        scopeId: project?.id ?? routeProjectRef,
        amount,
        windowKind: "lifetime",
      }),
    onSuccess: () => {
      if (!resolvedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(resolvedCompanyId) });
    },
  });

  if (pluginTabFromSearch && !pluginDetailSlotsLoading && !activePluginTab) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (activeTab === "workspaces" && workspaceTabDecisionLoaded && !showWorkspacesTab) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  // Redirect bare /projects/:id to cached tab or default route
  if (routeProjectRef && activeTab === null) {
    let cachedTab: string | null = null;
    if (project?.id) {
      try { cachedTab = localStorage.getItem(`paperclip:project-tab:${project.id}`); } catch {}
    }
    if (cachedTab === "overview") {
      return <Navigate to={`/projects/${canonicalProjectRef}/overview`} replace />;
    }
    if (cachedTab === "intake") {
      return <Navigate to={`/projects/${canonicalProjectRef}/intake`} replace />;
    }
    if (cachedTab === "configuration") {
      return <Navigate to={`/projects/${canonicalProjectRef}/configuration`} replace />;
    }
    if (cachedTab === "budget") {
      return <Navigate to={`/projects/${canonicalProjectRef}/budget`} replace />;
    }
    if (cachedTab === "workspaces" && workspaceTabDecisionLoaded && showWorkspacesTab) {
      return <Navigate to={`/projects/${canonicalProjectRef}/workspaces`} replace />;
    }
    if (cachedTab === "workspaces" && !workspaceTabDecisionLoaded) {
      return <PageSkeleton variant="detail" />;
    }
    if (isProjectPluginTab(cachedTab)) {
      return <Navigate to={`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(cachedTab)}`} replace />;
    }
    if (shouldDefaultProjectRouteToIntake(project)) {
      return <Navigate to={`/projects/${canonicalProjectRef}/intake`} replace />;
    }
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!project) return null;

  const handleTabChange = (tab: ProjectTab) => {
    // Cache the active tab per project
    if (project?.id) {
      try { localStorage.setItem(`paperclip:project-tab:${project.id}`, tab); } catch {}
    }
    if (isProjectPluginTab(tab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(tab)}`);
      return;
    }
    if (tab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`);
    } else if (tab === "intake") {
      navigate(`/projects/${canonicalProjectRef}/intake`);
    } else if (tab === "workspaces") {
      navigate(`/projects/${canonicalProjectRef}/workspaces`);
    } else if (tab === "budget") {
      navigate(`/projects/${canonicalProjectRef}/budget`);
    } else if (tab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`);
    } else {
      navigate(`/projects/${canonicalProjectRef}/issues`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-7 flex items-center">
          <ColorPicker
            currentColor={project.color ?? "#6366f1"}
            onSelect={(color) => updateProject.mutate({ color })}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <InlineEditor
            value={project.name}
            onSave={(name) => updateProject.mutate({ name })}
            as="h2"
            className="text-xl font-bold"
          />
          {project.pauseReason === "budget" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-200">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Paused by budget hard stop
            </div>
          ) : null}
        </div>
      </div>

      <PluginSlotOutlet
        slotTypes={["toolbarButton", "contextMenuItem"]}
        entityType="project"
        context={{
          companyId: resolvedCompanyId ?? null,
          companyPrefix: companyPrefix ?? null,
          projectId: project.id,
          projectRef: canonicalProjectRef,
          entityId: project.id,
          entityType: "project",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
        missingBehavior="placeholder"
      />

      <PluginLauncherOutlet
        placementZones={["toolbarButton"]}
        entityType="project"
        context={{
          companyId: resolvedCompanyId ?? null,
          companyPrefix: companyPrefix ?? null,
          projectId: project.id,
          projectRef: canonicalProjectRef,
          entityId: project.id,
          entityType: "project",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
      />

      <Tabs value={activeTab ?? "list"} onValueChange={(value) => handleTabChange(value as ProjectTab)}>
        <PageTabBar
          items={[
            { value: "list", label: "Issues" },
            { value: "overview", label: "Overview" },
            { value: "intake", label: "Intake" },
            ...(showWorkspacesTab ? [{ value: "workspaces", label: "Workspaces" }] : []),
            { value: "configuration", label: "Configuration" },
            { value: "budget", label: "Budget" },
            ...pluginTabItems.map((item) => ({
              value: item.value,
              label: item.label,
            })),
          ]}
          align="start"
          value={activeTab ?? "list"}
          onValueChange={(value) => handleTabChange(value as ProjectTab)}
        />
      </Tabs>

      {activeTab === "overview" && (
        <OverviewContent
          project={project}
          companyPrefix={companyPrefix}
        />
      )}

      {activeTab === "intake" && (
        <ProjectIntakePanel
          project={project}
          companyPrefix={companyPrefix}
          baselineIssue={baselineIssue ? {
            status: baselineIssue.status,
            assigneeAgentId: baselineIssue.assigneeAgentId ?? null,
          } : null}
          repositoryBaseline={repositoryBaseline}
          hasBaselineCeoReviewRequest={hasBaselineCeoReviewRequest || hasCompletedBaselineCeoReview}
          baselineReviewAgentName={baselineReviewAgent?.name ?? null}
          baselineActionMessage={baselineActionMessage}
          isRefreshingBaseline={refreshRepositoryBaseline.isPending}
          isApplyingRecommendations={applyRepositoryBaselineRecommendations.isPending}
          isRequestingCeoReview={requestBaselineCeoReview.isPending}
          isAcceptingRepositoryContext={acceptRepositoryBaseline.isPending}
          isSavingExecutionClarifications={saveExecutionContract.isPending}
          isMarkingExecutionReady={markExecutionContextReady.isPending}
          onRefreshBaseline={() => refreshRepositoryBaseline.mutate({})}
          onCreateOperatorIssue={() => refreshRepositoryBaseline.mutate({ createTrackingIssue: true })}
          onRunAnalyzer={() => refreshRepositoryBaseline.mutate({ createTrackingIssue: true, runAnalyzer: true })}
          onApplyRecommendations={() => applyRepositoryBaselineRecommendations.mutate()}
          onRequestCeoReview={() => requestBaselineCeoReview.mutate()}
          onAcceptRepositoryContext={() => acceptRepositoryBaseline.mutate()}
          executionContractDraft={executionContractDraft}
          onExecutionContractDraftChange={(patch) =>
            setExecutionContractDraft((current) => ({ ...current, ...patch }))
          }
          executionContractComplete={executionContractComplete}
          onSaveExecutionClarifications={() => saveExecutionContract.mutate()}
          onMarkExecutionContextReady={() => markExecutionContextReady.mutate()}
          staffingPreview={previewHiringBrief.data?.preview ?? null}
          staffingPreviewOpen={staffingPreviewOpen}
          onStaffingPreviewOpenChange={setStaffingPreviewOpen}
          isGeneratingBrief={previewHiringBrief.isPending}
          isCreatingHiringIssue={createHiringIssue.isPending}
          onGenerateBrief={() => previewHiringBrief.mutate()}
          onCreateHiringIssue={() => createHiringIssue.mutate()}
        />
      )}

      {activeTab === "list" && project?.id && resolvedCompanyId && (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} />
      )}

      {activeTab === "workspaces" ? (
        workspaceTabDecisionLoaded ? (
          workspaceTabError ? (
            <p className="text-sm text-destructive">{workspaceTabError.message}</p>
          ) : (
            <ProjectWorkspacesContent
              companyId={resolvedCompanyId!}
              projectId={project.id}
              projectRef={canonicalProjectRef}
              summaries={workspaceSummaries}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">Loading workspaces...</p>
        )
      ) : null}

      {activeTab === "configuration" && (
        <div className="max-w-4xl">
          <ProjectProperties
            project={project}
            onUpdate={(data) => updateProject.mutate(data)}
            onFieldUpdate={updateProjectField}
            getFieldSaveState={(field) => fieldSaveStates[field] ?? "idle"}
            onArchive={(archived) => archiveProject.mutate(archived)}
            archivePending={archiveProject.isPending}
          />
        </div>
      )}

      {activeTab === "budget" && resolvedCompanyId ? (
        <div className="max-w-3xl">
          <BudgetPolicyCard
            summary={projectBudgetSummary}
            variant="plain"
            isSaving={budgetMutation.isPending}
            onSave={(amount) => budgetMutation.mutate(amount)}
          />
        </div>
      ) : null}

      {activePluginTab && (
        <PluginSlotMount
          slot={activePluginTab.slot}
          context={{
            companyId: resolvedCompanyId,
            companyPrefix: companyPrefix ?? null,
            projectId: project.id,
            projectRef: canonicalProjectRef,
            entityId: project.id,
            entityType: "project",
          }}
          missingBehavior="placeholder"
        />
      )}
    </div>
  );
}
