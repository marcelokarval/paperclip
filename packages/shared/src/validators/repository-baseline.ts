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

export const repositoryBaselineRecommendationConfidenceSchema = z.enum(["low", "medium", "high"]);
export const repositoryBaselineRecommendationDecisionSchema = z.enum(["accepted", "declined"]);

export const repositoryBaselineSuggestedLabelSchema = z.object({
  name: z.string().trim().min(1).max(48),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{6})$/, "Color must be a 6-digit hex value"),
  description: z.string().trim().min(1).max(280),
  evidence: z.array(z.string().trim().min(1)).default([]),
  confidence: repositoryBaselineRecommendationConfidenceSchema,
}).strict();

export const repositoryBaselineOwnershipAreaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  paths: z.array(z.string().trim().min(1)).default([]),
  recommendedLabels: z.array(z.string().trim().min(1).max(48)).default([]),
}).strict();

export const repositoryBaselineIssuePolicyRecommendationSchema = z.object({
  parentChildGuidance: z.array(z.string().trim().min(1)).default([]),
  blockingGuidance: z.array(z.string().trim().min(1)).default([]),
  labelUsageGuidance: z.array(z.string().trim().min(1)).default([]),
  reviewGuidance: z.array(z.string().trim().min(1)).default([]),
  approvalGuidance: z.array(z.string().trim().min(1)).default([]),
}).strict();

export const repositoryBaselineProjectDefaultsRecommendationSchema = z.object({
  canonicalDocs: z.array(z.string().trim().min(1)).default([]),
  suggestedVerificationCommands: z.array(z.string().trim().min(1)).default([]),
  ownershipAreas: z.array(repositoryBaselineOwnershipAreaSchema).default([]),
}).strict();

export const repositoryBaselineRecommendationsSchema = z.object({
  labels: z.array(repositoryBaselineSuggestedLabelSchema).default([]),
  issuePolicy: repositoryBaselineIssuePolicyRecommendationSchema,
  projectDefaults: repositoryBaselineProjectDefaultsRecommendationSchema,
}).strict();

export const repositoryBaselineRecommendationDecisionRecordSchema = z.object({
  kind: z.enum(["label", "issue_policy", "project_default"]),
  key: z.string().trim().min(1),
  decision: repositoryBaselineRecommendationDecisionSchema,
  decidedAt: z.string(),
}).strict();

export const repositoryBaselineAcceptedGuidanceSchema = z.object({
  acceptedAt: z.string(),
  acceptedByUserId: z.string().nullable(),
  labels: z.array(repositoryBaselineSuggestedLabelSchema).default([]),
  issuePolicy: repositoryBaselineIssuePolicyRecommendationSchema,
  projectDefaults: repositoryBaselineProjectDefaultsRecommendationSchema,
}).strict();

export const repositoryBaselineAnalyzerStatusSchema = z.enum([
  "not_configured",
  "succeeded",
  "failed",
  "timed_out",
  "invalid_output",
]);

export const repositoryBaselineAnalyzerChangeSetSchema = z.object({
  appliedChanges: z.array(z.string().trim().min(1)).default([]),
  noOpReason: z.string().nullable(),
}).strict();

export const repositoryBaselineAnalyzerResultSchema = z.object({
  status: repositoryBaselineAnalyzerStatusSchema,
  provider: z.enum(["codex_local", "custom_command"]),
  command: z.string().nullable(),
  model: z.string().nullable(),
  ranAt: z.string(),
  durationMs: z.number().nonnegative(),
  summary: z.string().nullable(),
  risks: z.array(z.string().trim().min(1)).default([]),
  agentGuidance: z.array(z.string().trim().min(1)).default([]),
  error: z.string().nullable(),
  changes: repositoryBaselineAnalyzerChangeSetSchema.default({
    appliedChanges: [],
    noOpReason: null,
  }),
  rawOutput: z.string().nullable().default(null),
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
  recommendations: repositoryBaselineRecommendationsSchema.optional(),
  analysis: repositoryBaselineAnalyzerResultSchema.nullable().optional(),
  acceptedGuidance: repositoryBaselineAcceptedGuidanceSchema.nullable().optional(),
  recommendationDecisions: z.array(repositoryBaselineRecommendationDecisionRecordSchema).optional(),
  trackingIssueId: z.string().nullable().optional(),
  trackingIssueIdentifier: z.string().nullable().optional(),
}).strict();

export const refreshRepositoryDocumentationBaselineRequestSchema = z.object({
  createTrackingIssue: z.boolean().optional().default(false),
  runAnalyzer: z.boolean().optional().default(false),
}).strict();

export const applyRepositoryBaselineRecommendationsRequestSchema = z.object({
  applyLabels: z.boolean().optional().default(true),
  acceptIssueGuidance: z.boolean().optional().default(true),
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
  const analysisRecord = asRecord(record?.analysis);
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
    recommendations: repositoryBaselineRecommendationsSchema.safeParse(record.recommendations).success
      ? repositoryBaselineRecommendationsSchema.parse(record.recommendations)
      : undefined,
    analysis: repositoryBaselineAnalyzerResultSchema.safeParse(record.analysis).success
      ? repositoryBaselineAnalyzerResultSchema.parse(record.analysis)
      : analysisRecord && repositoryBaselineAnalyzerStatusSchema.safeParse(analysisRecord.status).success
        ? {
            status: analysisRecord.status as RepositoryDocumentationBaseline["analysis"] extends { status: infer S } ? S : never,
            provider: analysisRecord.provider === "custom_command" ? "custom_command" : "codex_local",
            command: asString(analysisRecord.command),
            model: asString(analysisRecord.model),
            ranAt: asString(analysisRecord.ranAt) ?? "",
            durationMs: typeof analysisRecord.durationMs === "number"
              ? Math.max(0, analysisRecord.durationMs as number)
              : 0,
            summary: asString(analysisRecord.summary),
            risks: asStringArray(analysisRecord.risks),
            agentGuidance: asStringArray(analysisRecord.agentGuidance),
            error: asString(analysisRecord.error),
            changes: {
              appliedChanges: [],
              noOpReason: null,
            },
            rawOutput: asString(analysisRecord.rawOutput),
          }
        : null,
    acceptedGuidance: repositoryBaselineAcceptedGuidanceSchema.safeParse(record.acceptedGuidance).success
      ? repositoryBaselineAcceptedGuidanceSchema.parse(record.acceptedGuidance)
      : null,
    recommendationDecisions: z.array(repositoryBaselineRecommendationDecisionRecordSchema).safeParse(record.recommendationDecisions).success
      ? z.array(repositoryBaselineRecommendationDecisionRecordSchema).parse(record.recommendationDecisions)
      : [],
    trackingIssueId: asString(record.trackingIssueId),
    trackingIssueIdentifier: asString(record.trackingIssueIdentifier),
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
    recommendations: {
      labels: [],
      issuePolicy: {
        parentChildGuidance: [],
        blockingGuidance: [],
        labelUsageGuidance: [],
        reviewGuidance: [],
        approvalGuidance: [],
      },
      projectDefaults: {
        canonicalDocs: [],
        suggestedVerificationCommands: [],
        ownershipAreas: [],
      },
    },
    analysis: null,
    acceptedGuidance: null,
    recommendationDecisions: [],
  };
}

export type RepositoryDocumentationBaselineInput = z.infer<typeof repositoryDocumentationBaselineSchema>;
export type RefreshRepositoryDocumentationBaselineRequestInput = z.infer<
  typeof refreshRepositoryDocumentationBaselineRequestSchema
>;
export type ApplyRepositoryBaselineRecommendationsRequestInput = z.infer<
  typeof applyRepositoryBaselineRecommendationsRequestSchema
>;
