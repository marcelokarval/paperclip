import type {
  AcceptProjectSuggestedGoalRequest,
  AcceptRepositoryBaselineRequest,
  CreateHiringIssueRequest,
  Project,
  ProjectWorkspace,
  GenerateHiringBriefRequest,
  HiringBriefPreview,
  Issue,
  ApplyRepositoryBaselineRecommendationsRequest,
  ApplyRepositoryBaselineRecommendationsResponse,
  MarkExecutionContextReadyRequest,
  RefreshRepositoryDocumentationBaselineRequest,
  RefreshRepositoryDocumentationBaselineResponse,
  UpdateExecutionContractRequest,
  WorkspaceOperation,
  WorkspaceRuntimeControlTarget,
} from "@paperclipai/shared";
import { api } from "./client";
import { sanitizeWorkspaceRuntimeControlTarget } from "./workspace-runtime-control";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  acceptSuggestedGoal: (id: string, key: string, data: AcceptProjectSuggestedGoalRequest = {}, companyId?: string) =>
    api.post<Project>(
      projectPath(id, companyId, `/operating-context/suggested-goals/${encodeURIComponent(key)}/accept`),
      data,
    ),
  rejectSuggestedGoal: (id: string, key: string, companyId?: string) =>
    api.post<Project>(
      projectPath(id, companyId, `/operating-context/suggested-goals/${encodeURIComponent(key)}/reject`),
      {},
    ),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  getRepositoryBaseline: (projectId: string, workspaceId: string, companyId?: string) =>
    api.get<RefreshRepositoryDocumentationBaselineResponse>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/repository-baseline`),
    ),
  refreshRepositoryBaseline: (
    projectId: string,
    workspaceId: string,
    companyId?: string,
    request: RefreshRepositoryDocumentationBaselineRequest = {},
  ) =>
    api.post<RefreshRepositoryDocumentationBaselineResponse>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/repository-baseline`),
      request,
    ),
  applyRepositoryBaselineRecommendations: (
    projectId: string,
    workspaceId: string,
    companyId?: string,
    request: ApplyRepositoryBaselineRecommendationsRequest = {},
  ) =>
    api.post<ApplyRepositoryBaselineRecommendationsResponse>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/repository-baseline/apply-recommendations`),
      request,
    ),
  acceptRepositoryBaseline: (
    projectId: string,
    workspaceId: string,
    request: AcceptRepositoryBaselineRequest = {},
    companyId?: string,
  ) =>
    api.post<{ baseline: unknown; workspace: ProjectWorkspace; project: Project }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/repository-baseline/accept`),
      request,
    ),
  markExecutionContextReady: (
    projectId: string,
    workspaceId: string,
    request: MarkExecutionContextReadyRequest = {},
    companyId?: string,
  ) =>
    api.post<{ project: Project }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/repository-baseline/execution-ready`),
      request,
    ),
  updateExecutionContract: (
    projectId: string,
    workspaceId: string,
    request: UpdateExecutionContractRequest,
    companyId?: string,
  ) =>
    api.post<{ project: Project }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/repository-baseline/execution-contract`),
      request,
    ),
  previewHiringBrief: (
    projectId: string,
    workspaceId: string,
    request: GenerateHiringBriefRequest,
    companyId?: string,
  ) =>
    api.post<{ preview: HiringBriefPreview }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/staffing/hiring-brief-preview`),
      request,
    ),
  createHiringIssue: (
    projectId: string,
    workspaceId: string,
    request: CreateHiringIssueRequest,
    companyId?: string,
  ) =>
    api.post<{ issue: Issue }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/staffing/hiring-issues`),
      request,
    ),
  controlWorkspaceRuntimeServices: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  controlWorkspaceCommands: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart" | "run",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-commands/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
};
