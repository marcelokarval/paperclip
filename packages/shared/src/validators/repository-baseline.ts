import { z } from "zod";
import {
  REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
  REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY,
  type RepositoryDocumentationBaseline,
} from "../types/repository-baseline.js";

export const repositoryDocumentationBaselineStatusSchema = z.enum(["not_started", "ready", "failed"]);
export const repositoryDocumentationBaselineSourceSchema = z.enum(["manual", "scan"]);
export const repositoryDocumentationBaselineDocKindSchema = z.enum([
  "readme",
  "agent_instructions",
  "product",
  "architecture",
  "development",
  "config",
  "other",
]);

export const repositoryDocumentationBaselineDocSchema = z.object({
  path: z.string(),
  kind: repositoryDocumentationBaselineDocKindSchema,
  summary: z.string().nullable(),
}).strict();

export const repositoryDocumentationBaselineRepositorySchema = z.object({
  cwd: z.string().nullable(),
  repoUrl: z.string().nullable(),
  repoRef: z.string().nullable(),
  defaultRef: z.string().nullable(),
}).strict();

export const repositoryDocumentationBaselineConstraintsSchema = z.object({
  repositoryWritesAllowed: z.literal(false),
  backlogGenerationAllowed: z.literal(false),
  childIssuesAllowed: z.literal(false),
  agentWakeupAllowed: z.literal(false),
}).strict();

export const repositoryDocumentationBaselineSchema = z.object({
  status: repositoryDocumentationBaselineStatusSchema,
  source: repositoryDocumentationBaselineSourceSchema,
  updatedAt: z.string(),
  summary: z.string().nullable(),
  stack: z.array(z.string()),
  documentationFiles: z.array(z.string()),
  guardrails: z.array(z.string()),
  repository: repositoryDocumentationBaselineRepositorySchema.optional(),
  docs: z.array(repositoryDocumentationBaselineDocSchema).optional(),
  gaps: z.array(z.string()).optional(),
  constraints: repositoryDocumentationBaselineConstraintsSchema.optional(),
}).strict();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

export function readRepositoryDocumentationBaselineFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): RepositoryDocumentationBaseline | null {
  const raw = asRecord(metadata)?.[REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY];
  const parsed = repositoryDocumentationBaselineSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const record = asRecord(raw);
  if (!record) return null;

  return {
    status: repositoryDocumentationBaselineStatusSchema.safeParse(record.status).success
      ? record.status as RepositoryDocumentationBaseline["status"]
      : "not_started",
    source: repositoryDocumentationBaselineSourceSchema.safeParse(record.source).success
      ? record.source as RepositoryDocumentationBaseline["source"]
      : "manual",
    updatedAt: asString(record.updatedAt) ?? "",
    summary: asString(record.summary),
    stack: asStringArray(record.stack),
    documentationFiles: asStringArray(record.documentationFiles),
    guardrails: asStringArray(record.guardrails),
    gaps: asStringArray(record.gaps),
  };
}

export function writeRepositoryDocumentationBaselineToMetadata(input: {
  metadata: Record<string, unknown> | null | undefined;
  baseline: RepositoryDocumentationBaseline;
}): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    [REPOSITORY_DOCUMENTATION_BASELINE_METADATA_KEY]: repositoryDocumentationBaselineSchema.parse(input.baseline),
  };
}

export function emptyRepositoryDocumentationBaseline(): RepositoryDocumentationBaseline {
  return {
    status: "not_started",
    source: "manual",
    updatedAt: "",
    summary: null,
    stack: [],
    documentationFiles: [],
    guardrails: REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
    gaps: [],
  };
}

export type RepositoryDocumentationBaselineInput = z.infer<typeof repositoryDocumentationBaselineSchema>;
