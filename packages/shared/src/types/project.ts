import type { PauseReason, ProjectStatus } from "../constants.js";
import type { AgentEnvConfig } from "./secrets.js";
import type {
  ProjectExecutionWorkspacePolicy,
  ProjectWorkspaceRuntimeConfig,
  WorkspaceRuntimeService,
} from "./workspace-runtime.js";

export type ProjectWorkspaceSourceType = "local_path" | "git_repo" | "remote_managed" | "non_git_path";
export type ProjectWorkspaceVisibility = "default" | "advanced";

export interface ProjectGoalRef {
  id: string;
  title: string;
}

export interface ProjectWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  sourceType: ProjectWorkspaceSourceType;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  visibility: ProjectWorkspaceVisibility;
  setupCommand: string | null;
  cleanupCommand: string | null;
  remoteProvider: string | null;
  remoteWorkspaceRef: string | null;
  sharedWorkspaceKey: string | null;
  metadata: Record<string, unknown> | null;
  runtimeConfig: ProjectWorkspaceRuntimeConfig | null;
  isPrimary: boolean;
  runtimeServices?: WorkspaceRuntimeService[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectCodebaseOrigin = "local_folder" | "managed_checkout";

export interface ProjectCodebase {
  workspaceId: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  repoName: string | null;
  localFolder: string | null;
  managedFolder: string;
  effectiveLocalFolder: string;
  origin: ProjectCodebaseOrigin;
}

export interface ProjectIssueSystemGuidance {
  labelUsageGuidance: string[];
  parentChildGuidance: string[];
  blockingGuidance: string[];
  reviewGuidance: string[];
  approvalGuidance: string[];
  canonicalDocs: string[];
  suggestedVerificationCommands: string[];
}

export interface ProjectOperatingContextLabelCatalogEntry {
  name: string;
  color: string;
  description: string;
  source: "repository_baseline" | "manual" | "system";
  evidence: string[];
  confidence: "low" | "medium" | "high";
}

export interface ProjectOperatingContextOwnershipArea {
  name: string;
  paths: string[];
  recommendedLabels: string[];
}

export interface ProjectExecutionContract {
  packageManager: string | null;
  installCommand: string | null;
  verificationCommands: string[];
  envHandoff: string | null;
  designAuthority: string | null;
  updatedAt: string | null;
}

export interface ProjectOperatingContextSuggestedGoal {
  key: string;
  title: string;
  description: string;
  reason: string;
  recommendedLabels: string[];
  suggestedVerificationCommands: string[];
  source: "repository_baseline";
  status: "pending" | "accepted" | "rejected";
  acceptedGoalId: string | null;
}

export interface ExecutiveProjectPacket {
  projectSummary: string;
  baselineTrackingIssueIdentifier: string | null;
  topRisks: string[];
  topGaps: string[];
  stackSummary: string[];
  docsToReadFirst: string[];
  operatingGuidance: string[];
  hiringSignals: Array<"cto" | "ux" | "marketing" | "ops">;
}

export interface TechnicalProjectPacket {
  projectSummary: string;
  stackSignals: string[];
  canonicalDocs: string[];
  verificationCommands: string[];
  ownershipAreas: ProjectOperatingContextOwnershipArea[];
  labelCatalog: Array<{
    name: string;
    description: string;
  }>;
  issueGuidance: string[];
}

export interface ProjectOperatingContext {
  baselineStatus: "none" | "available" | "accepted";
  baselineAcceptedAt: string | null;
  executionReadiness?: "unknown" | "needs_operator_contract" | "ready";
  executionReadinessUpdatedAt?: string | null;
  executionContract?: ProjectExecutionContract | null;
  baselineTrackingIssueId: string | null;
  baselineTrackingIssueIdentifier: string | null;
  baselineFingerprint: string | null;
  overviewSummary: string | null;
  configurationDescriptionSuggestion: string | null;
  descriptionSource: "manual" | "baseline" | "none";
  labelCatalog: ProjectOperatingContextLabelCatalogEntry[];
  canonicalDocs: string[];
  verificationCommands: string[];
  ownershipAreas: ProjectOperatingContextOwnershipArea[];
  operatingGuidance: string[];
  suggestedGoals: ProjectOperatingContextSuggestedGoal[];
  executiveProjectPacket: ExecutiveProjectPacket | null;
  technicalProjectPacket: TechnicalProjectPacket | null;
}

export type ProjectStaffingRecommendedRole = "cto" | "ux" | "marketing" | "ops";
export type ProjectStaffingStatus =
  | "not_started"
  | "brief_generated"
  | "issue_created"
  | "approval_pending"
  | "hire_approved"
  | "role_onboarded";

export interface ProjectStaffingState {
  recommendedRole: ProjectStaffingRecommendedRole | null;
  status: ProjectStaffingStatus;
  baselineIssueId: string | null;
  baselineIssueIdentifier: string | null;
  hiringIssueId: string | null;
  hiringIssueIdentifier: string | null;
  lastBriefGeneratedAt: string | null;
}

export interface AcceptRepositoryBaselineRequest {
  acceptIssueGuidance?: boolean;
}

export interface MarkExecutionContextReadyRequest {
  ready?: boolean;
}

export interface UpdateExecutionContractRequest {
  packageManager?: string | null;
  installCommand?: string | null;
  verificationCommands?: string[];
  envHandoff?: string | null;
  designAuthority?: string | null;
}

export interface GenerateHiringBriefRequest {
  role: "cto";
  sourceIssueId?: string | null;
}

export interface CreateHiringIssueRequest {
  role: "cto";
  sourceIssueId?: string | null;
}

export interface HiringBriefCanonicalReference {
  type: "issue" | "doc" | "project";
  label: string;
  value: string;
}

export interface HiringBriefPreview {
  role: "cto";
  title: string;
  summary: string;
  sourceSignals: string[];
  rationale: string[];
  projectContext: string[];
  risks: string[];
  expectedFirstOutput: string[];
  guardrails: string[];
  canonicalReferences: HiringBriefCanonicalReference[];
  successCriteria: string[];
}

export interface AcceptProjectSuggestedGoalRequest {
  title?: string | null;
  description?: string | null;
}

export interface Project {
  id: string;
  companyId: string;
  urlKey: string;
  /** @deprecated Use goalIds / goals instead */
  goalId: string | null;
  goalIds: string[];
  goals: ProjectGoalRef[];
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  env: AgentEnvConfig | null;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
  issueSystemGuidance?: ProjectIssueSystemGuidance | null;
  operatingContext?: ProjectOperatingContext | null;
  staffingState?: ProjectStaffingState | null;
  codebase: ProjectCodebase;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
