type LearningIssue = {
  id: string;
  identifier?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  parentId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  labels?: Array<{ name?: string | null } | string> | null;
  executionPolicy?: Record<string, unknown> | null;
  executionState?: Record<string, unknown> | null;
};

type LearningProject = {
  name?: string | null;
  operatingContext?: {
    executionReadiness?: unknown;
  } | null;
  primaryWorkspace?: {
    cwd?: string | null;
    name?: string | null;
  } | null;
};

const LEARNING_STATUSES = new Set(["done", "blocked", "cancelled"]);
const REQUIRED_ROUTING_FIELDS = [
  "project_of_record",
  "business_owner",
  "technical_owner",
  "workspace_of_record",
  "execution_allowed",
  "review_gate",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readIssueText(issue: LearningIssue) {
  return `${issue.title}\n${issue.description ?? ""}`;
}

function hasFieldInText(text: string, field: string) {
  const fieldPattern = field.replace(/_/g, "[_ -]");
  return new RegExp(`(^|\\n)\\s*[-*]?\\s*${fieldPattern}\\s*[:=-]`, "i").test(text);
}

function readLabelNames(issue: LearningIssue): string[] {
  if (!Array.isArray(issue.labels)) return [];
  return issue.labels
    .map((label) => typeof label === "string" ? label : label.name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

function executionPolicyHasReviewGate(issue: LearningIssue) {
  const policy = issue.executionPolicy;
  if (!isRecord(policy) || !Array.isArray(policy.stages)) return false;
  return policy.stages.some((stage) => {
    if (!isRecord(stage)) return false;
    return stage.type === "review" || stage.type === "approval";
  });
}

function detectMissingFields(issue: LearningIssue, project?: LearningProject | null) {
  const text = readIssueText(issue);
  const missing = REQUIRED_ROUTING_FIELDS.filter((field) => !hasFieldInText(text, field));
  return missing.filter((field) => {
    if (field === "project_of_record" && project?.name) return false;
    if (field === "workspace_of_record" && (project?.primaryWorkspace?.cwd || project?.primaryWorkspace?.name)) return false;
    if (field === "execution_allowed" && project?.operatingContext?.executionReadiness) return false;
    if (field === "review_gate" && executionPolicyHasReviewGate(issue)) return false;
    return true;
  });
}

function detectLearningSignals(input: {
  issue: LearningIssue;
  previousIssue?: LearningIssue | null;
  project?: LearningProject | null;
}) {
  const signals: string[] = [];
  const missingFields = detectMissingFields(input.issue, input.project);
  const labels = readLabelNames(input.issue);

  if (missingFields.length > 0) signals.push("missing_routing_fields");
  if (labels.length === 0) signals.push("missing_labels");
  if (!input.issue.assigneeAgentId && !input.issue.assigneeUserId) signals.push("missing_assignee");
  if (!input.issue.projectId) signals.push("missing_project");
  if (input.issue.status === "blocked") signals.push("blocked_status");
  if (input.issue.status === "cancelled") signals.push("cancelled_status");
  if (input.previousIssue && input.previousIssue.status !== input.issue.status) signals.push("status_transition");

  return {
    labels,
    missingFields,
    signals,
  };
}

export function shouldRecordIssueLearning(input: {
  issue: LearningIssue;
  previousIssue?: LearningIssue | null;
}): boolean {
  if (!LEARNING_STATUSES.has(input.issue.status)) return false;
  if (!input.previousIssue) return true;
  return input.previousIssue.status !== input.issue.status;
}

export function buildIssueLearningRecordActivityDetails(input: {
  source: "issue.status_transition" | "issue.create";
  issue: LearningIssue;
  previousIssue?: LearningIssue | null;
  project?: LearningProject | null;
}): Record<string, unknown> {
  const { labels, missingFields, signals } = detectLearningSignals(input);
  const suggestedInstructionSurfaces = [
    "COMMUNICATION_PROTOCOL.md",
    "ROUTING_TABLE.md",
    "LESSONS_LEDGER.md",
  ];

  if (missingFields.length > 0) suggestedInstructionSurfaces.push("AGENTS.md");
  if (input.issue.status === "blocked" || input.issue.status === "cancelled") {
    suggestedInstructionSurfaces.push("WORKFLOW_PLAYBOOK.md");
  }

  return {
    source: input.source,
    issueId: input.issue.id,
    identifier: input.issue.identifier ?? null,
    issueTitle: input.issue.title,
    previousStatus: input.previousIssue?.status ?? null,
    status: input.issue.status,
    parentIssueId: input.issue.parentId ?? null,
    projectId: input.issue.projectId ?? null,
    goalId: input.issue.goalId ?? null,
    assigneeAgentId: input.issue.assigneeAgentId ?? null,
    assigneeUserId: input.issue.assigneeUserId ?? null,
    labels,
    signals,
    missingFields,
    suggestedInstructionSurfaces: [...new Set(suggestedInstructionSurfaces)],
    lessonProposal: {
      source_issue: input.issue.identifier ?? input.issue.id,
      observed_problem: signals.length > 0
        ? `Issue reached ${input.issue.status} with ${signals.join(", ")}.`
        : `Issue reached ${input.issue.status}; capture reusable routing and communication lessons.`,
      impact: input.issue.status === "done"
        ? "closure learning"
        : "workflow risk or operator confusion",
      proposed_instruction_surface: suggestedInstructionSurfaces[0],
      proposed_change: "Review whether routing, communication, labels, or handoff rules need an explicit instruction update.",
      scope: "agent/company workflow",
      requires_hitl: true,
    },
  };
}
