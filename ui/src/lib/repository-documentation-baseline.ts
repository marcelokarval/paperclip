import {
  REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
  type RepositoryDocumentationBaseline,
  type RepositoryDocumentationBaselineStatus,
  readRepositoryDocumentationBaselineFromMetadata,
  writeRepositoryDocumentationBaselineToMetadata,
} from "@paperclipai/shared";

export type RepositoryDocumentationBaselineForm = {
  status: RepositoryDocumentationBaselineStatus;
  summary: string;
  stack: string;
  documentationFiles: string;
  guardrails: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
): RepositoryDocumentationBaseline | null {
  return readRepositoryDocumentationBaselineFromMetadata(metadata);
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
  const existingBaseline = readRepositoryDocumentationBaseline(input.metadata);
  const summary = asString(input.form.summary);
  return writeRepositoryDocumentationBaselineToMetadata({
    metadata: current,
    baseline: {
      status: input.form.status,
      source: "manual",
      updatedAt: input.updatedAt,
      summary,
      stack: splitBaselineLines(input.form.stack),
      documentationFiles: splitBaselineLines(input.form.documentationFiles),
      guardrails: splitBaselineLines(input.form.guardrails),
      trackingIssueId: existingBaseline?.trackingIssueId ?? null,
      trackingIssueIdentifier: existingBaseline?.trackingIssueIdentifier ?? null,
    },
  });
}

export {
  REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
  type RepositoryDocumentationBaselineStatus,
};
