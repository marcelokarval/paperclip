import type { ProjectWorkspace } from "./project.js";
import type { Issue, IssueLabel } from "./issue.js";

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

export type RepositoryBaselineRecommendationConfidence = "low" | "medium" | "high";
export type RepositoryBaselineRecommendationDecision = "accepted" | "declined";

export interface RepositoryBaselineSuggestedLabel {
  name: string;
  color: string;
  description: string;
  evidence: string[];
  confidence: RepositoryBaselineRecommendationConfidence;
}

export interface RepositoryBaselineOwnershipArea {
  name: string;
  paths: string[];
  recommendedLabels: string[];
}

export interface RepositoryBaselineIssuePolicyRecommendation {
  parentChildGuidance: string[];
  blockingGuidance: string[];
  labelUsageGuidance: string[];
  reviewGuidance: string[];
  approvalGuidance: string[];
}

export interface RepositoryBaselineProjectDefaultsRecommendation {
  canonicalDocs: string[];
  suggestedVerificationCommands: string[];
  ownershipAreas: RepositoryBaselineOwnershipArea[];
}

export interface RepositoryBaselineRecommendations {
  labels: RepositoryBaselineSuggestedLabel[];
  issuePolicy: RepositoryBaselineIssuePolicyRecommendation;
  projectDefaults: RepositoryBaselineProjectDefaultsRecommendation;
}

export interface RepositoryBaselineRecommendationDecisionRecord {
  kind: "label" | "issue_policy" | "project_default";
  key: string;
  decision: RepositoryBaselineRecommendationDecision;
  decidedAt: string;
}

export interface RepositoryBaselineAcceptedGuidance {
  acceptedAt: string;
  acceptedByUserId: string | null;
  labels: RepositoryBaselineSuggestedLabel[];
  issuePolicy: RepositoryBaselineIssuePolicyRecommendation;
  projectDefaults: RepositoryBaselineProjectDefaultsRecommendation;
}

export type RepositoryBaselineAnalyzerStatus =
  | "not_configured"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "invalid_output";

export interface RepositoryBaselineAnalyzerChangeSet {
  appliedChanges: string[];
  noOpReason: string | null;
}

export interface RepositoryBaselineAnalyzerResult {
  status: RepositoryBaselineAnalyzerStatus;
  provider: "codex_local" | "custom_command";
  command: string | null;
  model: string | null;
  ranAt: string;
  durationMs: number;
  summary: string | null;
  risks: string[];
  agentGuidance: string[];
  error: string | null;
  changes: RepositoryBaselineAnalyzerChangeSet;
  rawOutput: string | null;
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
  recommendations?: RepositoryBaselineRecommendations;
  analysis?: RepositoryBaselineAnalyzerResult | null;
  acceptedGuidance?: RepositoryBaselineAcceptedGuidance | null;
  recommendationDecisions?: RepositoryBaselineRecommendationDecisionRecord[];
  trackingIssueId?: string | null;
  trackingIssueIdentifier?: string | null;
}

export interface RefreshRepositoryDocumentationBaselineRequest {
  createTrackingIssue?: boolean;
  runAnalyzer?: boolean;
}

export interface ApplyRepositoryBaselineRecommendationsRequest {
  applyLabels?: boolean;
  acceptIssueGuidance?: boolean;
}

export interface AppliedRepositoryBaselineLabelsResult {
  created: IssueLabel[];
  existing: IssueLabel[];
  skipped: RepositoryBaselineSuggestedLabel[];
}

export interface RefreshRepositoryDocumentationBaselineResponse {
  baseline: RepositoryDocumentationBaseline;
  workspace: ProjectWorkspace;
  trackingIssue?: Issue | null;
}

export interface ApplyRepositoryBaselineRecommendationsResponse {
  baseline: RepositoryDocumentationBaseline;
  workspace: ProjectWorkspace;
  labels: AppliedRepositoryBaselineLabelsResult;
}
