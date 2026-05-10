import type {
  IssueAssigneeAdapterOverrides,
  IssueExecutionPolicy,
} from "@paperclipai/shared";

type RoutingAssignee = {
  type: "agent" | "user" | null;
  agentId: string | null;
  userId: string | null;
};

type RoutingIssue = {
  id: string;
  companyId: string;
  identifier?: string | null;
  title: string;
  description?: string | null;
  parentId?: string | null;
  projectId?: string | null;
  projectWorkspaceId?: string | null;
  originKind?: string | null;
  originId?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  assigneeAdapterOverrides?: IssueAssigneeAdapterOverrides | Record<string, unknown> | null;
  executionPolicy?: IssueExecutionPolicy | Record<string, unknown> | null;
  executionWorkspaceId?: string | null;
  executionWorkspacePreference?: string | null;
  executionWorkspaceSettings?: Record<string, unknown> | null;
};

type RoutingProject = {
  name?: string | null;
  issueSystemGuidance?: unknown;
  operatingContext?: {
    executionReadiness?: unknown;
  } | null;
  primaryWorkspace?: {
    cwd?: string | null;
    name?: string | null;
  } | null;
};

type RoutingTextKey =
  | "project_of_record"
  | "business_owner"
  | "technical_owner"
  | "workspace_of_record"
  | "execution_allowed"
  | "review_gate"
  | "rationale"
  | "confidence";

type RoutingContextValues = Partial<Record<RoutingTextKey, string | boolean>>;

const ROUTING_FIELDS = [
  "project_of_record",
  "business_owner",
  "technical_owner",
  "workspace_of_record",
  "execution_allowed",
  "review_gate",
] as const;

const TEXT_PATTERNS: Array<{ key: RoutingTextKey; pattern: RegExp }> = [
  { key: "project_of_record", pattern: /^\s*(?:project[_ -]of[_ -]record|project of record)\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "business_owner", pattern: /^\s*(?:business[_ -]owner|business owner)\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "technical_owner", pattern: /^\s*(?:technical[_ -]owner|technical owner)\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "workspace_of_record", pattern: /^\s*(?:workspace[_ -]of[_ -]record|workspace of record)\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "execution_allowed", pattern: /^\s*(?:execution[_ -]allowed|execution allowed)\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "review_gate", pattern: /^\s*(?:review[_ -]gate|review gate)\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "rationale", pattern: /^\s*rationale\s*[:=-]\s*(.+?)\s*$/gim },
  { key: "confidence", pattern: /^\s*confidence\s*[:=-]\s*(.+?)\s*$/gim },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBooleanish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = readNonEmptyString(value)?.toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "allowed", "allow", "enabled"].includes(text)) return true;
  if (["false", "no", "n", "blocked", "disallowed", "disabled"].includes(text)) return false;
  return null;
}

function mergeValue(target: RoutingContextValues, key: RoutingTextKey, value: unknown) {
  if (target[key] !== undefined) return;
  if (key === "execution_allowed") {
    const parsed = readBooleanish(value);
    if (parsed !== null) target[key] = parsed;
    return;
  }
  const text = readNonEmptyString(value);
  if (text) target[key] = text;
}

function extractFromRecord(value: unknown, output: RoutingContextValues) {
  if (!isRecord(value)) return;
  for (const key of [...ROUTING_FIELDS, "rationale", "confidence"] as const) {
    mergeValue(output, key, value[key] ?? value[toCamelCase(key)]);
  }
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function extractFromText(text: string | null | undefined, output: RoutingContextValues) {
  if (!text) return;
  for (const { key, pattern } of TEXT_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) mergeValue(output, key, match[1]);
  }
}

function collectStrings(value: unknown, output: string[], depth = 0) {
  if (depth > 4 || output.length >= 80) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output, depth + 1);
    return;
  }
  if (isRecord(value)) {
    extractFromRecord(value, {});
    for (const item of Object.values(value)) collectStrings(item, output, depth + 1);
  }
}

function summarizeAssignee(issue: Pick<RoutingIssue, "assigneeAgentId" | "assigneeUserId">): RoutingAssignee {
  if (issue.assigneeAgentId) {
    return { type: "agent", agentId: issue.assigneeAgentId, userId: null };
  }
  if (issue.assigneeUserId) {
    return { type: "user", agentId: null, userId: issue.assigneeUserId };
  }
  return { type: null, agentId: null, userId: null };
}

function summarizeReviewGate(policy: unknown): string | null {
  if (!isRecord(policy)) return null;
  const stages = Array.isArray(policy.stages) ? policy.stages : [];
  const gateTypes = stages
    .map((stage) => isRecord(stage) ? readNonEmptyString(stage.type) : null)
    .filter((type): type is string => type === "review" || type === "approval");
  if (gateTypes.length === 0) return null;
  return [...new Set(gateTypes)].join("+");
}

function deriveProjectGuidance(project: RoutingProject | null | undefined): string[] {
  if (!project) return [];
  const strings: string[] = [];
  collectStrings(project.issueSystemGuidance, strings);
  collectStrings(project.operatingContext, strings);
  return strings;
}

function deriveRoutingContext(input: {
  issue: RoutingIssue;
  body?: string | null;
  project?: RoutingProject | null;
}): RoutingContextValues {
  const values: RoutingContextValues = {};
  extractFromText(input.issue.description, values);
  extractFromText(input.body, values);
  extractFromRecord(input.issue.executionPolicy, values);
  for (const text of deriveProjectGuidance(input.project)) {
    extractFromText(text, values);
  }

  const projectName = readNonEmptyString(input.project?.name);
  if (values.project_of_record === undefined && projectName) {
    values.project_of_record = projectName;
  }
  if (values.workspace_of_record === undefined) {
    values.workspace_of_record =
      input.issue.executionWorkspaceId ??
      input.issue.projectWorkspaceId ??
      input.project?.primaryWorkspace?.cwd ??
      input.project?.primaryWorkspace?.name ??
      undefined;
  }
  if (values.execution_allowed === undefined && input.project?.operatingContext?.executionReadiness) {
    values.execution_allowed = input.project.operatingContext.executionReadiness === "ready";
  }
  if (values.review_gate === undefined) {
    values.review_gate = summarizeReviewGate(input.issue.executionPolicy) ?? undefined;
  }
  return values;
}

export function hasRoutingDecisionTrigger(input: {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  assigneeAdapterOverrides?: IssueAssigneeAdapterOverrides | Record<string, unknown> | null;
}): boolean {
  return Boolean(
    input.assigneeAgentId ||
    input.assigneeUserId ||
    input.assigneeAdapterOverrides !== undefined,
  );
}

export function buildIssueRoutingDecisionActivityDetails(input: {
  source: "issue.create" | "issue.update";
  issue: RoutingIssue;
  previousIssue?: RoutingIssue | null;
  body?: string | null;
  project?: RoutingProject | null;
}): Record<string, unknown> {
  const values = deriveRoutingContext({
    issue: input.issue,
    body: input.body,
    project: input.project,
  });
  const missingFields = ROUTING_FIELDS.filter((field) => values[field] === undefined);
  const sourceIssueId =
    input.issue.parentId ??
    (input.issue.originKind === "issue" ? readNonEmptyString(input.issue.originId) : null);

  return {
    source: input.source,
    issueId: input.issue.id,
    identifier: input.issue.identifier ?? null,
    issueTitle: input.issue.title,
    sourceIssueId,
    parentIssueId: input.issue.parentId ?? null,
    previousAssignee: input.previousIssue ? summarizeAssignee(input.previousIssue) : null,
    selectedAssignee: summarizeAssignee(input.issue),
    assigneeMetadata: input.issue.assigneeAdapterOverrides ?? null,
    project_of_record: values.project_of_record ?? null,
    business_owner: values.business_owner ?? null,
    technical_owner: values.technical_owner ?? null,
    workspace_of_record: values.workspace_of_record ?? null,
    execution_allowed: values.execution_allowed ?? null,
    review_gate: values.review_gate ?? null,
    rationale: values.rationale ?? null,
    confidence: values.confidence ?? null,
    missingFields,
  };
}
