import {
  REPOSITORY_BASELINE_CEO_REVIEW_REQUEST_MARKER,
  type Project,
  type Issue,
  type ProjectExecutionContract,
  type RepositoryDocumentationBaseline,
} from "@paperclipai/shared";

const REPOSITORY_BASELINE_CEO_REVIEW_RESPONSE_MARKER = "<!-- paperclip:baseline-ceo-review-response";

function formatBaselineList(values: readonly string[] | null | undefined, emptyFallback: string) {
  if (!values || values.length === 0) return `- ${emptyFallback}`;
  return values.map((value) => `- ${value}`).join("\n");
}

function escapeAttribute(value: string) {
  return value.replace(/"/g, "&quot;");
}

function buildRepositoryBaselineReviewRequestMarker(fingerprint: string | null | undefined) {
  const normalized = fingerprint?.trim() || null;
  if (!normalized) return REPOSITORY_BASELINE_CEO_REVIEW_REQUEST_MARKER;
  return `<!-- paperclip:baseline-ceo-review-request fingerprint="${escapeAttribute(normalized)}" -->`;
}

function readMarkerFingerprint(body: string, markerPrefix: string) {
  const pattern = new RegExp(`${markerPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+fingerprint=\"([^\"]+)\"\\s*-->`, "i");
  const match = body.match(pattern);
  return match?.[1]?.trim() || null;
}

export function buildRepositoryBaselineReviewFingerprint(input: {
  project: Project | null | undefined;
  baseline: RepositoryDocumentationBaseline | null | undefined;
}) {
  const operatingContext = input.project?.operatingContext ?? null;
  const base =
    operatingContext?.baselineFingerprint?.trim()
    || input.baseline?.updatedAt?.trim()
    || null;
  if (!base) return null;
  const repositoryContextStage = operatingContext?.baselineStatus === "accepted"
    ? "repository_context_accepted"
    : "baseline_available";
  return `${base}|${repositoryContextStage}`;
}

export function buildBaselineCeoReviewRequestComment(input: {
  baselineIssue: Pick<Issue, "id" | "identifier">;
  summary: string | null | undefined;
  stack: readonly string[] | null | undefined;
  documentationFiles: readonly string[] | null | undefined;
  guardrails: readonly string[] | null | undefined;
  reviewFingerprint?: string | null;
}) {
  const baselineRef = input.baselineIssue.identifier ?? input.baselineIssue.id;
  return [
    buildRepositoryBaselineReviewRequestMarker(input.reviewFingerprint),
    `CEO baseline review request for ${baselineRef}.`,
    "",
    "Scope constraints:",
    "- Keep the review in this same baseline issue.",
    "- Do not create child issues, new issues, backlog decomposition, PRs, or repository writes.",
    "- Do not wake or assign other agents unless the operator explicitly asks.",
    "- Use the baseline as read-only Paperclip context.",
    "- When documentation conflicts, prefer operator-approved freshness notes and explicitly named canonical docs over older analysis docs.",
    "",
    "Baseline summary:",
    input.summary?.trim() || "No baseline summary recorded.",
    "",
    "Detected stack signals:",
    formatBaselineList(input.stack, "No stack signals recorded."),
    "",
    "Documentation files to inspect first:",
    formatBaselineList(input.documentationFiles, "No documentation files recorded."),
    "",
    "Baseline guardrails:",
    formatBaselineList(input.guardrails, "No guardrails recorded."),
    "",
    "Expected output:",
    "- Confirm whether the baseline is sufficient for future agent work.",
    "- Identify missing context the operator should add before delegation.",
    "- Recommend the next single operator action, if any.",
  ].join("\n");
}

export function normalizeExecutionContractText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeExecutionContractCommands(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isExecutionContractComplete(contract: ProjectExecutionContract | null | undefined) {
  if (!contract) return false;
  return Boolean(
    contract.packageManager?.trim()
    && contract.installCommand?.trim()
    && contract.verificationCommands.length > 0
    && contract.envHandoff?.trim()
    && contract.designAuthority?.trim(),
  );
}

export function buildExecutionContractDraft(contract: ProjectExecutionContract | null | undefined) {
  return {
    packageManager: contract?.packageManager ?? "",
    installCommand: contract?.installCommand ?? "",
    verificationCommands: contract?.verificationCommands.join("\n") ?? "",
    envHandoff: contract?.envHandoff ?? "",
    designAuthority: contract?.designAuthority ?? "",
  };
}

export function readBaselineReviewRequestPresent(comments: readonly Pick<{ body: string }, "body">[] | null | undefined) {
  return (comments ?? []).some((comment) => typeof comment.body === "string" && comment.body.includes(REPOSITORY_BASELINE_CEO_REVIEW_REQUEST_MARKER));
}

export function readBaselineReviewRequestPresentForFingerprint(
  comments: readonly Pick<{ body: string }, "body">[] | null | undefined,
  fingerprint: string | null | undefined,
) {
  const normalized = fingerprint?.trim() || null;
  return (comments ?? []).some((comment) => {
    if (typeof comment.body !== "string") return false;
    if (!comment.body.includes(REPOSITORY_BASELINE_CEO_REVIEW_REQUEST_MARKER)) return false;
    if (!normalized) return true;
    return readMarkerFingerprint(comment.body, "<!-- paperclip:baseline-ceo-review-request") === normalized;
  });
}

export function readBaselineReviewResponsePresentForFingerprint(
  comments: readonly Pick<{ body: string }, "body">[] | null | undefined,
  fingerprint: string | null | undefined,
) {
  const normalized = fingerprint?.trim() || null;
  return (comments ?? []).some((comment) => {
    if (typeof comment.body !== "string") return false;
    if (!comment.body.includes(REPOSITORY_BASELINE_CEO_REVIEW_RESPONSE_MARKER)) return false;
    if (!normalized) return true;
    return readMarkerFingerprint(comment.body, "<!-- paperclip:baseline-ceo-review-response") === normalized;
  });
}

export function readBaselineTrackingBaseline(
  baseline: RepositoryDocumentationBaseline | null | undefined,
  issue: Pick<Issue, "id" | "identifier"> | null | undefined,
) {
  if (!baseline || !issue) return false;
  return baseline.trackingIssueId === issue.id || baseline.trackingIssueIdentifier === issue.identifier;
}
