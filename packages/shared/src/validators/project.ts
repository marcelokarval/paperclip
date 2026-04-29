import { z } from "zod";
import { PROJECT_STATUSES } from "../constants.js";
import { envConfigSchema } from "./secret.js";

const executionWorkspaceStrategySchema = z
  .object({
    type: z.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
    baseRef: z.string().optional().nullable(),
    branchTemplate: z.string().optional().nullable(),
    worktreeParentDir: z.string().optional().nullable(),
    provisionCommand: z.string().optional().nullable(),
    teardownCommand: z.string().optional().nullable(),
  })
  .strict();

export const projectExecutionWorkspacePolicySchema = z
  .object({
    enabled: z.boolean(),
    defaultMode: z.enum(["shared_workspace", "isolated_workspace", "operator_branch", "adapter_default"]).optional(),
    allowIssueOverride: z.boolean().optional(),
    defaultProjectWorkspaceId: z.string().uuid().optional().nullable(),
    workspaceStrategy: executionWorkspaceStrategySchema.optional().nullable(),
    workspaceRuntime: z.record(z.unknown()).optional().nullable(),
    branchPolicy: z.record(z.unknown()).optional().nullable(),
    pullRequestPolicy: z.record(z.unknown()).optional().nullable(),
    runtimePolicy: z.record(z.unknown()).optional().nullable(),
    cleanupPolicy: z.record(z.unknown()).optional().nullable(),
  })
  .strict();

export const projectWorkspaceRuntimeConfigSchema = z.object({
  workspaceRuntime: z.record(z.unknown()).optional().nullable(),
  desiredState: z.enum(["running", "stopped"]).optional().nullable(),
  serviceStates: z.record(z.enum(["running", "stopped"])).optional().nullable(),
}).strict();

const guidanceStringArraySchema = z.array(z.string().trim().min(1).max(500)).max(50).default([]);

export const projectIssueSystemGuidanceSchema = z.object({
  labelUsageGuidance: guidanceStringArraySchema,
  parentChildGuidance: guidanceStringArraySchema,
  blockingGuidance: guidanceStringArraySchema,
  reviewGuidance: guidanceStringArraySchema,
  approvalGuidance: guidanceStringArraySchema,
  canonicalDocs: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  suggestedVerificationCommands: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
}).strict();

const operatingContextDocArraySchema = z.array(z.string().trim().min(1).max(300)).max(50).default([]);

const projectOperatingContextOwnershipAreaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  paths: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  recommendedLabels: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
}).strict();

const projectExecutionContractSchema = z.object({
  packageManager: z.string().trim().min(1).max(80).nullable(),
  installCommand: z.string().trim().min(1).max(300).nullable(),
  verificationCommands: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  envHandoff: z.string().trim().min(1).max(2_000).nullable(),
  designAuthority: z.string().trim().min(1).max(500).nullable(),
  updatedAt: z.string().datetime().nullable(),
}).strict();

const projectOperatingContextLabelCatalogEntrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(32),
  description: z.string().trim().min(1).max(500),
  source: z.enum(["repository_baseline", "manual", "system"]),
  evidence: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  confidence: z.enum(["low", "medium", "high"]),
}).strict();

const projectOperatingContextSuggestedGoalSchema = z.object({
  key: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2_000),
  reason: z.string().trim().min(1).max(500),
  recommendedLabels: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  suggestedVerificationCommands: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  source: z.literal("repository_baseline"),
  status: z.enum(["pending", "accepted", "rejected"]),
  acceptedGoalId: z.string().uuid().nullable(),
}).strict();

const executiveProjectPacketSchema = z.object({
  projectSummary: z.string().trim().min(1).max(2_000),
  baselineTrackingIssueIdentifier: z.string().trim().min(1).max(120).nullable(),
  topRisks: guidanceStringArraySchema,
  topGaps: guidanceStringArraySchema,
  stackSummary: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  docsToReadFirst: operatingContextDocArraySchema,
  operatingGuidance: guidanceStringArraySchema,
  hiringSignals: z.array(z.enum(["cto", "ux", "marketing", "ops"])).max(10).default([]),
}).strict();

const technicalProjectPacketLabelCatalogEntrySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
}).strict();

const technicalProjectPacketSchema = z.object({
  projectSummary: z.string().trim().min(1).max(2_000),
  stackSignals: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  canonicalDocs: operatingContextDocArraySchema,
  verificationCommands: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  ownershipAreas: z.array(projectOperatingContextOwnershipAreaSchema).max(50).default([]),
  labelCatalog: z.array(technicalProjectPacketLabelCatalogEntrySchema).max(100).default([]),
  issueGuidance: guidanceStringArraySchema,
}).strict();

export const projectOperatingContextSchema = z.object({
  baselineStatus: z.enum(["none", "available", "accepted"]),
  baselineAcceptedAt: z.string().datetime().nullable(),
  executionReadiness: z.enum(["unknown", "needs_operator_contract", "ready"]).optional().default("unknown"),
  executionReadinessUpdatedAt: z.string().datetime().nullable().optional().default(null),
  executionContract: projectExecutionContractSchema.nullable().optional().default(null),
  baselineTrackingIssueId: z.string().uuid().nullable(),
  baselineTrackingIssueIdentifier: z.string().trim().min(1).max(120).nullable(),
  baselineFingerprint: z.string().trim().min(1).max(200).nullable(),
  overviewSummary: z.string().trim().min(1).max(2_000).nullable(),
  configurationDescriptionSuggestion: z.string().trim().min(1).max(2_000).nullable(),
  descriptionSource: z.enum(["manual", "baseline", "none"]),
  labelCatalog: z.array(projectOperatingContextLabelCatalogEntrySchema).max(100).default([]),
  canonicalDocs: operatingContextDocArraySchema,
  verificationCommands: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  ownershipAreas: z.array(projectOperatingContextOwnershipAreaSchema).max(50).default([]),
  operatingGuidance: guidanceStringArraySchema,
  suggestedGoals: z.array(projectOperatingContextSuggestedGoalSchema).max(20).default([]),
  executiveProjectPacket: executiveProjectPacketSchema.nullable(),
  technicalProjectPacket: technicalProjectPacketSchema.nullable(),
}).strict();

export const projectStaffingRecommendedRoleSchema = z.enum(["cto", "ux", "marketing", "ops"]);
export const projectStaffingStatusSchema = z.enum([
  "not_started",
  "brief_generated",
  "issue_created",
  "approval_pending",
  "hire_approved",
  "role_onboarded",
]);

export const projectStaffingStateSchema = z.object({
  recommendedRole: projectStaffingRecommendedRoleSchema.nullable(),
  status: projectStaffingStatusSchema,
  baselineIssueId: z.string().uuid().nullable(),
  baselineIssueIdentifier: z.string().trim().min(1).max(120).nullable(),
  hiringIssueId: z.string().uuid().nullable(),
  hiringIssueIdentifier: z.string().trim().min(1).max(120).nullable(),
  lastBriefGeneratedAt: z.string().datetime().nullable(),
}).strict();

export const generateHiringBriefRequestSchema = z.object({
  role: z.literal("cto"),
  sourceIssueId: z.string().uuid().optional().nullable(),
}).strict();

export const createHiringIssueRequestSchema = z.object({
  role: z.literal("cto"),
  sourceIssueId: z.string().uuid().optional().nullable(),
}).strict();

export const acceptRepositoryBaselineRequestSchema = z.object({
  acceptIssueGuidance: z.boolean().optional().default(true),
}).strict();

export const markExecutionContextReadyRequestSchema = z.object({
  ready: z.boolean().optional().default(true),
}).strict();

export const updateExecutionContractRequestSchema = z.object({
  packageManager: z.string().trim().min(1).max(80).optional().nullable(),
  installCommand: z.string().trim().min(1).max(300).optional().nullable(),
  verificationCommands: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  envHandoff: z.string().trim().min(1).max(2_000).optional().nullable(),
  designAuthority: z.string().trim().min(1).max(500).optional().nullable(),
}).strict();

export const hiringBriefCanonicalReferenceSchema = z.object({
  type: z.enum(["issue", "doc", "project"]),
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(500),
}).strict();

export const hiringBriefPreviewSchema = z.object({
  role: z.literal("cto"),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2_000),
  sourceSignals: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  rationale: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  projectContext: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
  risks: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  expectedFirstOutput: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  guardrails: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  canonicalReferences: z.array(hiringBriefCanonicalReferenceSchema).max(40).default([]),
  successCriteria: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
}).strict();

const projectWorkspaceSourceTypeSchema = z.enum(["local_path", "git_repo", "remote_managed", "non_git_path"]);
const projectWorkspaceVisibilitySchema = z.enum(["default", "advanced"]);
const ALLOWED_PROJECT_WORKSPACE_REPO_URL_PROTOCOLS = new Set(["http:", "https:"]);

function projectWorkspaceRepoUrlSchema() {
  return z
    .string()
    .url()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return ALLOWED_PROJECT_WORKSPACE_REPO_URL_PROTOCOLS.has(parsed.protocol);
      } catch {
        return false;
      }
    }, "repoUrl must use http:// or https://");
}

const projectWorkspaceFields = {
  name: z.string().min(1).optional(),
  sourceType: projectWorkspaceSourceTypeSchema.optional(),
  cwd: z.string().min(1).optional().nullable(),
  repoUrl: projectWorkspaceRepoUrlSchema().optional().nullable(),
  repoRef: z.string().optional().nullable(),
  defaultRef: z.string().optional().nullable(),
  visibility: projectWorkspaceVisibilitySchema.optional(),
  setupCommand: z.string().optional().nullable(),
  cleanupCommand: z.string().optional().nullable(),
  remoteProvider: z.string().optional().nullable(),
  remoteWorkspaceRef: z.string().optional().nullable(),
  sharedWorkspaceKey: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  runtimeConfig: projectWorkspaceRuntimeConfigSchema.optional().nullable(),
};

function validateProjectWorkspace(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  const sourceType = value.sourceType ?? "local_path";
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  const hasRemoteRef = typeof value.remoteWorkspaceRef === "string" && value.remoteWorkspaceRef.trim().length > 0;

  if (sourceType === "remote_managed") {
    if (!hasRemoteRef && !hasRepo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remote-managed workspace requires remoteWorkspaceRef or repoUrl.",
        path: ["remoteWorkspaceRef"],
      });
    }
    return;
  }

  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"],
    });
  }
}

export const createProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional().default(false),
}).superRefine(validateProjectWorkspace);

export type CreateProjectWorkspace = z.infer<typeof createProjectWorkspaceSchema>;

export const updateProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional(),
}).partial();

export type UpdateProjectWorkspace = z.infer<typeof updateProjectWorkspaceSchema>;

const projectFields = {
  /** @deprecated Use goalIds instead */
  goalId: z.string().uuid().optional().nullable(),
  goalIds: z.array(z.string().uuid()).optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default("backlog"),
  leadAgentId: z.string().uuid().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  env: envConfigSchema.optional().nullable(),
  executionWorkspacePolicy: projectExecutionWorkspacePolicySchema.optional().nullable(),
  issueSystemGuidance: projectIssueSystemGuidanceSchema.optional().nullable(),
  operatingContext: projectOperatingContextSchema.optional().nullable(),
  archivedAt: z.string().datetime().optional().nullable(),
};

export const createProjectSchema = z.object({
  ...projectFields,
  workspace: createProjectWorkspaceSchema.optional(),
});

export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object(projectFields).partial();

export type UpdateProject = z.infer<typeof updateProjectSchema>;

export const acceptProjectSuggestedGoalSchema = z.object({
  title: z.string().trim().min(1).max(200).optional().nullable(),
  description: z.string().trim().min(1).max(2_000).optional().nullable(),
}).strict();

export type AcceptProjectSuggestedGoalRequest = z.infer<typeof acceptProjectSuggestedGoalSchema>;

export type ProjectExecutionWorkspacePolicy = z.infer<typeof projectExecutionWorkspacePolicySchema>;
export type ProjectIssueSystemGuidance = z.infer<typeof projectIssueSystemGuidanceSchema>;
export type ProjectOperatingContext = z.infer<typeof projectOperatingContextSchema>;
export type ProjectExecutionContract = z.infer<typeof projectExecutionContractSchema>;
export type ProjectOperatingContextLabelCatalogEntry = z.infer<typeof projectOperatingContextLabelCatalogEntrySchema>;
export type ProjectOperatingContextOwnershipArea = z.infer<typeof projectOperatingContextOwnershipAreaSchema>;
export type ProjectOperatingContextSuggestedGoal = z.infer<typeof projectOperatingContextSuggestedGoalSchema>;
export type ProjectStaffingRecommendedRole = z.infer<typeof projectStaffingRecommendedRoleSchema>;
export type ProjectStaffingStatus = z.infer<typeof projectStaffingStatusSchema>;
export type ProjectStaffingState = z.infer<typeof projectStaffingStateSchema>;
export type AcceptRepositoryBaselineRequest = z.infer<typeof acceptRepositoryBaselineRequestSchema>;
export type MarkExecutionContextReadyRequest = z.infer<typeof markExecutionContextReadyRequestSchema>;
export type UpdateExecutionContractRequest = z.infer<typeof updateExecutionContractRequestSchema>;
export type GenerateHiringBriefRequest = z.infer<typeof generateHiringBriefRequestSchema>;
export type CreateHiringIssueRequest = z.infer<typeof createHiringIssueRequestSchema>;
export type HiringBriefCanonicalReference = z.infer<typeof hiringBriefCanonicalReferenceSchema>;
export type HiringBriefPreview = z.infer<typeof hiringBriefPreviewSchema>;
export type ExecutiveProjectPacket = z.infer<typeof executiveProjectPacketSchema>;
export type TechnicalProjectPacket = z.infer<typeof technicalProjectPacketSchema>;
