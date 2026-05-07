import { z } from "zod";
import {
  ISSUE_EXECUTION_DECISION_OUTCOMES,
  ISSUE_EXECUTION_POLICY_MODES,
  ISSUE_EXECUTION_STAGE_TYPES,
  ISSUE_EXECUTION_STATE_STATUSES,
  ISSUE_THREAD_INTERACTION_CONTINUATION_POLICIES,
  ISSUE_THREAD_INTERACTION_KINDS,
  ISSUE_THREAD_INTERACTION_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  MODEL_PROFILE_KEYS,
} from "../constants.js";
import { normalizeHumanTextInput } from "../text-normalization.js";

const humanTextSchema = z.string().transform(normalizeHumanTextInput);

export const ISSUE_EXECUTION_WORKSPACE_PREFERENCES = [
  "inherit",
  "shared_workspace",
  "isolated_workspace",
  "operator_branch",
  "reuse_existing",
  "agent_default",
] as const;

const executionWorkspaceStrategySchema = z
  .object({
    type: z.enum(["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]).optional(),
    baseRef: z.string().optional().nullable(),
    branchTemplate: z.string().optional().nullable(),
    worktreeParentDir: z.string().optional().nullable(),
  })
  .strict();

export const issueExecutionWorkspaceSettingsSchema = z
  .object({
    mode: z.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional(),
    workspaceStrategy: executionWorkspaceStrategySchema.optional().nullable(),
    workspaceRuntime: z.record(z.unknown()).optional().nullable(),
  })
  .strict();

export const issueAssigneeAdapterOverridesSchema = z
  .object({
    modelProfile: z.enum(MODEL_PROFILE_KEYS).optional(),
    adapterConfig: z
      .object({
        model: z.string().min(1).optional(),
        modelReasoningEffort: z.string().min(1).optional(),
        effort: z.string().min(1).optional(),
        variant: z.string().min(1).optional(),
        chrome: z.boolean().optional(),
      })
      .strict()
      .optional(),
    useProjectWorkspace: z.boolean().optional(),
  })
  .strict();

const issueExecutionStagePrincipalBaseSchema = z.object({
  type: z.enum(["agent", "user"]),
  agentId: z.string().uuid().optional().nullable(),
  userId: z.string().optional().nullable(),
});

export const issueExecutionStagePrincipalSchema = issueExecutionStagePrincipalBaseSchema
  .superRefine((value, ctx) => {
    if (value.type === "agent") {
      if (!value.agentId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Agent participants require agentId", path: ["agentId"] });
      }
      if (value.userId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Agent participants cannot set userId", path: ["userId"] });
      }
      return;
    }
    if (!value.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "User participants require userId", path: ["userId"] });
    }
    if (value.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "User participants cannot set agentId", path: ["agentId"] });
    }
  });

export const issueExecutionStageParticipantSchema = issueExecutionStagePrincipalBaseSchema.extend({
  id: z.string().uuid().optional(),
}).superRefine((value, ctx) => {
  if (value.type === "agent") {
    if (!value.agentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Agent participants require agentId", path: ["agentId"] });
    }
    if (value.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Agent participants cannot set userId", path: ["userId"] });
    }
    return;
  }
  if (!value.userId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "User participants require userId", path: ["userId"] });
  }
  if (value.agentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "User participants cannot set agentId", path: ["agentId"] });
  }
});

export const issueExecutionStageSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(ISSUE_EXECUTION_STAGE_TYPES),
  approvalsNeeded: z.literal(1).optional().default(1),
  participants: z.array(issueExecutionStageParticipantSchema).default([]),
});

export const issueExecutionPolicySchema = z.object({
  mode: z.enum(ISSUE_EXECUTION_POLICY_MODES).optional().default("normal"),
  commentRequired: z.boolean().optional().default(true),
  stages: z.array(issueExecutionStageSchema).default([]),
});

export const issueExecutionStateSchema = z.object({
  status: z.enum(ISSUE_EXECUTION_STATE_STATUSES),
  currentStageId: z.string().uuid().nullable(),
  currentStageIndex: z.number().int().nonnegative().nullable(),
  currentStageType: z.enum(ISSUE_EXECUTION_STAGE_TYPES).nullable(),
  currentParticipant: issueExecutionStagePrincipalSchema.nullable(),
  returnAssignee: issueExecutionStagePrincipalSchema.nullable(),
  completedStageIds: z.array(z.string().uuid()).default([]),
  lastDecisionId: z.string().uuid().nullable(),
  lastDecisionOutcome: z.enum(ISSUE_EXECUTION_DECISION_OUTCOMES).nullable(),
});

type IssueCreateStatusDefaultInput = {
  status?: unknown;
  assigneeAgentId?: unknown;
  assigneeUserId?: unknown;
};

export function resolveCreateIssueStatusDefault(input: IssueCreateStatusDefaultInput): {
  status: (typeof ISSUE_STATUSES)[number];
  defaulted: boolean;
  reason: "explicit" | "assigned_omitted_status" | "unassigned_omitted_status";
} {
  if (input.status !== undefined) {
    return {
      status: input.status as (typeof ISSUE_STATUSES)[number],
      defaulted: false,
      reason: "explicit",
    };
  }

  const hasAssignee =
    (typeof input.assigneeAgentId === "string" && input.assigneeAgentId.length > 0) ||
    (typeof input.assigneeUserId === "string" && input.assigneeUserId.length > 0);

  return {
    status: hasAssignee ? "todo" : "backlog",
    defaulted: true,
    reason: hasAssignee ? "assigned_omitted_status" : "unassigned_omitted_status",
  };
}

const createIssueBaseSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  projectWorkspaceId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  blockedByIssueIds: z.array(z.string().uuid()).optional(),
  inheritExecutionWorkspaceFromIssueId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: humanTextSchema.optional().nullable(),
  status: z.enum(ISSUE_STATUSES),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  assigneeUserId: z.string().optional().nullable(),
  requestDepth: z.number().int().nonnegative().optional().default(0),
  billingCode: z.string().optional().nullable(),
  assigneeAdapterOverrides: issueAssigneeAdapterOverridesSchema.optional().nullable(),
  executionPolicy: issueExecutionPolicySchema.optional().nullable(),
  executionWorkspaceId: z.string().uuid().optional().nullable(),
  executionWorkspacePreference: z.enum(ISSUE_EXECUTION_WORKSPACE_PREFERENCES).optional().nullable(),
  executionWorkspaceSettings: issueExecutionWorkspaceSettingsSchema.optional().nullable(),
  labelIds: z.array(z.string().uuid()).optional(),
});

export const createIssueInputSchema = createIssueBaseSchema.extend({
  status: createIssueBaseSchema.shape.status.optional(),
});

export const createIssueSchema = createIssueBaseSchema.extend({
  status: createIssueBaseSchema.shape.status.optional().default("backlog"),
});

export type CreateIssue = z.infer<typeof createIssueSchema>;

export const createIssueLabelSchema = z.object({
  name: z.string().trim().min(1).max(48),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{6})$/, "Color must be a 6-digit hex value"),
  description: z.string().trim().max(500).optional().nullable(),
  source: z.enum(["manual", "repository_baseline", "system"]).optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateIssueLabel = z.infer<typeof createIssueLabelSchema>;

export const updateIssueLabelSchema = createIssueLabelSchema.partial();

export type UpdateIssueLabel = z.infer<typeof updateIssueLabelSchema>;

export const issueHitlRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: humanTextSchema.pipe(z.string().min(1).max(4000)),
  proposedItems: z.array(z.string().trim().min(1).max(200)).max(50).optional().default([]),
  proposedComment: humanTextSchema.pipe(z.string().max(12000)).optional().nullable(),
  recommendedAction: humanTextSchema.pipe(z.string().min(1).max(2000)).optional(),
  nextActionOnApproval: humanTextSchema.pipe(z.string().min(1).max(2000)).optional(),
});

export type IssueHitlRequest = z.infer<typeof issueHitlRequestSchema>;

export const updateIssueSchema = createIssueBaseSchema.partial().extend({
  assigneeAgentId: z.string().trim().min(1).optional().nullable(),
  comment: humanTextSchema.pipe(z.string().min(1)).optional(),
  hitlRequest: issueHitlRequestSchema.optional(),
  reopen: z.boolean().optional(),
  interrupt: z.boolean().optional(),
  hiddenAt: z.string().datetime().nullable().optional(),
});

export type UpdateIssue = z.infer<typeof updateIssueSchema>;
export type IssueExecutionWorkspaceSettings = z.infer<typeof issueExecutionWorkspaceSettingsSchema>;

export const checkoutIssueSchema = z.object({
  agentId: z.string().uuid(),
  expectedStatuses: z.array(z.enum(ISSUE_STATUSES)).nonempty(),
});

export type CheckoutIssue = z.infer<typeof checkoutIssueSchema>;

export const addIssueCommentSchema = z.object({
  body: humanTextSchema.pipe(z.string().min(1)),
  hitlRequest: issueHitlRequestSchema.optional(),
  reopen: z.boolean().optional(),
  interrupt: z.boolean().optional(),
});

export type AddIssueComment = z.infer<typeof addIssueCommentSchema>;

export const issueThreadInteractionStatusSchema = z.enum(ISSUE_THREAD_INTERACTION_STATUSES);
export const issueThreadInteractionKindSchema = z.enum(ISSUE_THREAD_INTERACTION_KINDS);
export const issueThreadInteractionContinuationPolicySchema = z.enum(
  ISSUE_THREAD_INTERACTION_CONTINUATION_POLICIES,
);

export const suggestedTaskDraftSchema = z.object({
  clientKey: z.string().trim().min(1).max(120),
  parentClientKey: z.string().trim().min(1).max(120).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20000).nullable().optional(),
  priority: z.enum(ISSUE_PRIORITIES).nullable().optional(),
  assigneeAgentId: z.string().uuid().nullable().optional(),
  assigneeUserId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  billingCode: z.string().trim().max(120).nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
  hiddenInPreview: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.assigneeAgentId && value.assigneeUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Suggested tasks can only target one assignee",
      path: ["assigneeAgentId"],
    });
  }
});

export const suggestTasksPayloadSchema = z.object({
  version: z.literal(1),
  defaultParentId: z.string().uuid().nullable().optional(),
  tasks: z.array(suggestedTaskDraftSchema).min(1).max(50),
}).superRefine((value, ctx) => {
  const seenClientKeys = new Set<string>();
  for (const [index, task] of value.tasks.entries()) {
    if (seenClientKeys.has(task.clientKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clientKey must be unique within one interaction",
        path: ["tasks", index, "clientKey"],
      });
    }
    seenClientKeys.add(task.clientKey);
  }
});

export const suggestTasksResultCreatedTaskSchema = z.object({
  clientKey: z.string().trim().min(1).max(120),
  issueId: z.string().uuid(),
  identifier: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).nullable().optional(),
  parentIssueId: z.string().uuid().nullable().optional(),
  parentIdentifier: z.string().trim().min(1).nullable().optional(),
});

export const suggestTasksResultSchema = z.object({
  version: z.literal(1),
  createdTasks: z.array(suggestTasksResultCreatedTaskSchema).max(50).optional(),
  skippedClientKeys: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  rejectionReason: z.string().trim().max(4000).nullable().optional(),
});

export const askUserQuestionsQuestionOptionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
});

export const askUserQuestionsQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(500),
  description: z.string().trim().max(1000).nullable().optional(),
  selectionMode: z.enum(["single", "multi"]),
  required: z.boolean().optional(),
  options: z.array(askUserQuestionsQuestionOptionSchema).min(1).max(10),
});

export const askUserQuestionsPayloadSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().max(240).nullable().optional(),
  submitLabel: z.string().trim().max(120).nullable().optional(),
  questions: z.array(askUserQuestionsQuestionSchema).min(1).max(10),
}).superRefine((value, ctx) => {
  const seenQuestionIds = new Set<string>();
  for (const [questionIndex, question] of value.questions.entries()) {
    if (seenQuestionIds.has(question.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Question ids must be unique within one interaction",
        path: ["questions", questionIndex, "id"],
      });
    }
    seenQuestionIds.add(question.id);

    const seenOptionIds = new Set<string>();
    for (const [optionIndex, option] of question.options.entries()) {
      if (seenOptionIds.has(option.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Option ids must be unique within one question",
          path: ["questions", questionIndex, "options", optionIndex, "id"],
        });
      }
      seenOptionIds.add(option.id);
    }
  }
});

export const askUserQuestionsAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(120),
  optionIds: z.array(z.string().trim().min(1).max(120)).max(20),
});

export const askUserQuestionsResultSchema = z.object({
  version: z.literal(1),
  answers: z.array(askUserQuestionsAnswerSchema).max(20),
  cancelled: z.literal(true).optional(),
  cancellationReason: z.string().trim().max(4000).nullable().optional(),
  summaryMarkdown: z.string().max(20000).nullable().optional(),
});

export const requestConfirmationPayloadSchema = z.object({
  version: z.literal(1),
  prompt: z.string().trim().min(1).max(1000),
  acceptLabel: z.string().trim().min(1).max(80).nullable().optional(),
  rejectLabel: z.string().trim().min(1).max(80).nullable().optional(),
  rejectRequiresReason: z.boolean().optional(),
  rejectReasonLabel: z.string().trim().min(1).max(160).nullable().optional(),
  allowDeclineReason: z.boolean().optional().default(true),
  declineReasonPlaceholder: z.string().trim().min(1).max(240).nullable().optional(),
  detailsMarkdown: z.string().max(20000).nullable().optional(),
});

export const requestConfirmationResultSchema = z.object({
  version: z.literal(1),
  outcome: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().max(4000).nullable().optional(),
});

const createIssueThreadInteractionBaseSchema = z.object({
  idempotencyKey: z.string().trim().max(255).nullable().optional(),
  sourceCommentId: z.string().uuid().nullable().optional(),
  sourceRunId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(240).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
});

export const createIssueThreadInteractionSchema = z.discriminatedUnion("kind", [
  createIssueThreadInteractionBaseSchema.extend({
    kind: z.literal("suggest_tasks"),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
    payload: suggestTasksPayloadSchema,
  }),
  createIssueThreadInteractionBaseSchema.extend({
    kind: z.literal("ask_user_questions"),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
    payload: askUserQuestionsPayloadSchema,
  }),
  createIssueThreadInteractionBaseSchema.extend({
    kind: z.literal("request_confirmation"),
    continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("none"),
    payload: requestConfirmationPayloadSchema,
  }),
]);
export type CreateIssueThreadInteraction = z.infer<typeof createIssueThreadInteractionSchema>;

export const acceptIssueThreadInteractionSchema = z.object({}).strict();
export type AcceptIssueThreadInteraction = z.infer<typeof acceptIssueThreadInteractionSchema>;

export const rejectIssueThreadInteractionSchema = z.object({
  reason: z.string().trim().max(4000).optional(),
});
export type RejectIssueThreadInteraction = z.infer<typeof rejectIssueThreadInteractionSchema>;

export const respondIssueThreadInteractionSchema = z.object({
  answers: z.array(askUserQuestionsAnswerSchema).max(20),
  summaryMarkdown: z.string().max(20000).nullable().optional(),
});
export type RespondIssueThreadInteraction = z.infer<typeof respondIssueThreadInteractionSchema>;

export const cancelIssueThreadInteractionSchema = z.object({
  reason: z.string().trim().max(4000).optional(),
});
export type CancelIssueThreadInteraction = z.infer<typeof cancelIssueThreadInteractionSchema>;

export const linkIssueApprovalSchema = z.object({
  approvalId: z.string().uuid(),
});

export type LinkIssueApproval = z.infer<typeof linkIssueApprovalSchema>;

export const createIssueAttachmentMetadataSchema = z.object({
  issueCommentId: z.string().uuid().optional().nullable(),
});

export type CreateIssueAttachmentMetadata = z.infer<typeof createIssueAttachmentMetadataSchema>;

export const ISSUE_DOCUMENT_FORMATS = ["markdown"] as const;

export const issueDocumentFormatSchema = z.enum(ISSUE_DOCUMENT_FORMATS);

export const issueDocumentKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Document key must be lowercase letters, numbers, _ or -");

export const upsertIssueDocumentSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  format: issueDocumentFormatSchema,
  body: z.string().max(524288),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  baseRevisionId: z.string().uuid().nullable().optional(),
});

export const restoreIssueDocumentRevisionSchema = z.object({});

export type IssueDocumentFormat = z.infer<typeof issueDocumentFormatSchema>;
export type UpsertIssueDocument = z.infer<typeof upsertIssueDocumentSchema>;
export type RestoreIssueDocumentRevision = z.infer<typeof restoreIssueDocumentRevisionSchema>;
