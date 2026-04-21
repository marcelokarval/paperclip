import type { ProjectWorkspace } from "./project.js";
import type { Issue } from "./issue.js";

export const REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY = "repositoryDocumentationBaseline";
export const REPOSITORY_BASELINE_CEO_REVIEW_REQUEST_MARKER = "<!-- paperclip:baseline-ceo-review-request -->";

export const REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS = [
  "Documentation only; do not create issues or child issues from this baseline.",
  "Do not wake agents, assign work, create PRs, or write files to the repository.",
  "Treat findings as Paperclip-owned context until an operator explicitly converts them into work.",
  "When documentation conflicts, treat operator-approved freshness notes and explicitly named canonical docs as newer than older analysis docs.",
];

export type RepositoryDocumentationBaselineStatus = "not_started" | "ready" | "failed";
export type RepositoryDocumentationBaselineSource = "manual" | "scan";

export type RepositoryDocumentationBaselineDocKind =
  | "readme"
  | "agent_instructions"
  | "product"
  | "architecture"
  | "development"
  | "config"
  | "other";

export interface RepositoryDocumentationBaselineDoc {
  path: string;
  kind: RepositoryDocumentationBaselineDocKind;
  summary: string | null;
}

export interface RepositoryDocumentationBaselineRepository {
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
}

export interface RepositoryDocumentationBaselineConstraints {
  repositoryWritesAllowed: false;
  backlogGenerationAllowed: false;
  childIssuesAllowed: false;
  agentWakeupAllowed: false;
}

export interface RepositoryDocumentationBaseline {
  status: RepositoryDocumentationBaselineStatus;
  source: RepositoryDocumentationBaselineSource;
  updatedAt: string;
  summary: string | null;
  stack: string[];
  documentationFiles: string[];
  guardrails: string[];
  repository?: RepositoryDocumentationBaselineRepository;
  docs?: RepositoryDocumentationBaselineDoc[];
  gaps?: string[];
  constraints?: RepositoryDocumentationBaselineConstraints;
  trackingIssueId?: string | null;
  trackingIssueIdentifier?: string | null;
}

export interface RefreshRepositoryDocumentationBaselineRequest {
  createTrackingIssue?: boolean;
}

export interface RefreshRepositoryDocumentationBaselineResponse {
  baseline: RepositoryDocumentationBaseline;
  workspace: ProjectWorkspace;
  trackingIssue?: Issue | null;
}
