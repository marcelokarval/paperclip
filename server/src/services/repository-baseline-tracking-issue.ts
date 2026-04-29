import type { RepositoryDocumentationBaseline } from "@paperclipai/shared";

type TrackingIssueReviewStage =
  | "not_requested"
  | "ceo_review_requested"
  | "ceo_review_completed"
  | "closed";

function deriveTrackingIssueReviewStage(input: {
  issueStatus?: string | null;
  issueAssigneeAgentId?: string | null;
}): TrackingIssueReviewStage {
  if (input.issueStatus === "done") return "closed";
  if (input.issueStatus === "in_review") return "ceo_review_completed";
  if (input.issueStatus === "in_progress" || input.issueAssigneeAgentId) {
    return "ceo_review_requested";
  }
  return "not_requested";
}

function buildOperatorNote(input: {
  repositoryContextStage: string;
  reviewStage: TrackingIssueReviewStage;
}) {
  if (input.repositoryContextStage === "repository_context_accepted") {
    return "Operator note: repository context has been accepted. Continue the repo-first workflow from Project Intake; staffing is unlocked and open clarifications can travel into the first CTO onboarding.";
  }
  if (input.reviewStage === "ceo_review_completed") {
    return "Operator note: the CEO review has completed in this issue. If the review is satisfactory, accept repository context from Project Intake. Open clarifications should not block the first CTO brief when the baseline is already strong enough.";
  }
  if (input.reviewStage === "ceo_review_requested") {
    return "Operator note: CEO baseline review is currently in progress in this issue. Use Project Intake as the primary control surface while keeping this issue as the canonical evidence thread.";
  }
  return "Operator note: agents may use this issue as context only after an explicit operator assignment or wakeup. A CEO review should stay in this issue and move the issue to operator review. Accepting repository context unlocks staffing. Execution readiness is optional hardening for a tighter operator contract and should not block the first CTO brief.";
}

export function buildRepositoryBaselineTrackingIssueDescription(input: {
  projectName: string;
  workspaceName: string;
  baseline: RepositoryDocumentationBaseline;
  operatingContext?: {
    baselineStatus?: string | null;
    executionReadiness?: string | null;
  } | null;
  issueStatus?: string | null;
  issueAssigneeAgentId?: string | null;
}) {
  const docs = input.baseline.documentationFiles.length > 0
    ? input.baseline.documentationFiles.map((file) => `- ${file}`).join("\n")
    : "- No documentation files were detected yet.";
  const stack = input.baseline.stack.length > 0
    ? input.baseline.stack.map((entry) => `- ${entry}`).join("\n")
    : "- No stack signals were detected yet.";
  const gaps = input.baseline.gaps && input.baseline.gaps.length > 0
    ? input.baseline.gaps.map((gap) => `- ${gap}`).join("\n")
    : "- No documentation gaps were recorded.";
  const suggestedLabels = input.baseline.recommendations?.labels.length
    ? input.baseline.recommendations.labels.map((label) => `- ${label.name}: ${label.description}`).join("\n")
    : "- No operational label suggestions were recorded.";
  const verificationCommands = input.baseline.recommendations?.projectDefaults.suggestedVerificationCommands.length
    ? input.baseline.recommendations.projectDefaults.suggestedVerificationCommands
        .map((command) => `- ${command}`)
        .join("\n")
    : "- No verification commands were suggested.";
  const analysis = input.baseline.analysis
    ? [
        `- Status: ${input.baseline.analysis.status}`,
        input.baseline.analysis.summary ? `- Summary: ${input.baseline.analysis.summary}` : null,
        input.baseline.analysis.error ? `- Error: ${input.baseline.analysis.error}` : null,
        ...input.baseline.analysis.changes.appliedChanges.map((entry) => `- Applied change: ${entry}`),
        input.baseline.analysis.changes.noOpReason ? `- No-op: ${input.baseline.analysis.changes.noOpReason}` : null,
        ...input.baseline.analysis.risks.map((risk) => `- Risk: ${risk}`),
        ...input.baseline.analysis.agentGuidance.map((guidance) => `- Guidance: ${guidance}`),
        input.baseline.analysis.rawOutput && input.baseline.analysis.status !== "succeeded"
          ? `- Raw output excerpt:\n\n\`\`\`\n${input.baseline.analysis.rawOutput}\n\`\`\``
          : null,
      ].filter(Boolean).join("\n")
    : "- AI analyzer has not been run for this baseline.";

  const repositoryContextStage = input.operatingContext?.baselineStatus === "accepted"
    ? "repository_context_accepted"
    : "baseline_available";
  const executionReadiness = input.operatingContext?.executionReadiness ?? "unknown";
  const reviewStage = deriveTrackingIssueReviewStage({
    issueStatus: input.issueStatus,
    issueAssigneeAgentId: input.issueAssigneeAgentId,
  });

  return [
    "This issue tracks the repository documentation baseline for this project.",
    "",
    `Project: ${input.projectName}`,
    `Workspace: ${input.workspaceName}`,
    `Baseline scan status: ${input.baseline.status}`,
    `Review stage: ${reviewStage}`,
    `Repository context stage: ${repositoryContextStage}`,
    `Execution readiness: ${executionReadiness}`,
    "",
    "Scope constraints:",
    "- This is not backlog decomposition.",
    "- Do not create child issues.",
    "- Do not modify repository files.",
    "- Do not assign implementation work.",
    "- Do not wake agents except for an explicit operator-requested CEO baseline review.",
    "- Produce or refresh only Paperclip-owned documentation artifacts.",
    "- When documentation conflicts, prefer operator-approved freshness notes and explicitly named canonical docs over older analysis docs.",
    "",
    "Detected documentation files:",
    docs,
    "",
    "Detected stack signals:",
    stack,
    "",
    "Documentation gaps:",
    gaps,
    "",
    "Suggested labels:",
    suggestedLabels,
    "",
    "Suggested verification commands:",
    verificationCommands,
    "",
    "AI analyzer enrichment:",
    analysis,
    "",
    buildOperatorNote({ repositoryContextStage, reviewStage }),
  ].join("\n");
}
