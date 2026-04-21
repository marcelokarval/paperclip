export const REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY = "repositoryDocumentationBaseline";

export type RepositoryDocumentationBaselineStatus = "not_started" | "ready" | "failed";

export type RepositoryDocumentationBaselineForm = {
  status: RepositoryDocumentationBaselineStatus;
  summary: string;
  stack: string;
  documentationFiles: string;
  guardrails: string;
};

export type RepositoryDocumentationBaselineMetadata = {
  status: RepositoryDocumentationBaselineStatus;
  source: "manual";
  updatedAt: string;
  summary: string | null;
  stack: string[];
  documentationFiles: string[];
  guardrails: string[];
};

export const REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS = [
  "Documentation only; do not create issues or child issues from this baseline.",
  "Do not wake agents, assign work, create PRs, or write files to the repository.",
  "Treat findings as Paperclip-owned context until an operator explicitly converts them into work.",
];

const STATUS_VALUES = new Set<RepositoryDocumentationBaselineStatus>(["not_started", "ready", "failed"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStatus(value: unknown): RepositoryDocumentationBaselineStatus {
  return typeof value === "string" && STATUS_VALUES.has(value as RepositoryDocumentationBaselineStatus)
    ? value as RepositoryDocumentationBaselineStatus
    : "not_started";
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function splitBaselineLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinBaselineLines(values: string[]) {
  return values.join("\n");
}

export function readRepositoryDocumentationBaseline(
  metadata: Record<string, unknown> | null | undefined,
): RepositoryDocumentationBaselineMetadata | null {
  const raw = asRecord(metadata)?.[REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY];
  const record = asRecord(raw);
  if (!record) return null;

  return {
    status: asStatus(record.status),
    source: "manual",
    updatedAt: asString(record.updatedAt) ?? "",
    summary: asString(record.summary),
    stack: asStringArray(record.stack),
    documentationFiles: asStringArray(record.documentationFiles),
    guardrails: asStringArray(record.guardrails),
  };
}

export function repositoryDocumentationBaselineFormFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): RepositoryDocumentationBaselineForm {
  const baseline = readRepositoryDocumentationBaseline(metadata);
  return {
    status: baseline?.status ?? "not_started",
    summary: baseline?.summary ?? "",
    stack: joinBaselineLines(baseline?.stack ?? []),
    documentationFiles: joinBaselineLines(baseline?.documentationFiles ?? []),
    guardrails: joinBaselineLines(
      baseline?.guardrails.length
        ? baseline.guardrails
        : REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
    ),
  };
}

export function writeRepositoryDocumentationBaselineMetadata(input: {
  metadata: Record<string, unknown> | null | undefined;
  form: RepositoryDocumentationBaselineForm;
  updatedAt: string;
}): Record<string, unknown> {
  const current = asRecord(input.metadata) ?? {};
  const summary = asString(input.form.summary);
  return {
    ...current,
    [REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY]: {
      status: input.form.status,
      source: "manual",
      updatedAt: input.updatedAt,
      summary,
      stack: splitBaselineLines(input.form.stack),
      documentationFiles: splitBaselineLines(input.form.documentationFiles),
      guardrails: splitBaselineLines(input.form.guardrails),
    } satisfies RepositoryDocumentationBaselineMetadata,
  };
}
