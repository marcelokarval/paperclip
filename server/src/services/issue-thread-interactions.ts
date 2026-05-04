import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, issueComments, issues, issueThreadInteractions } from "@paperclipai/db";
import type {
  AcceptIssueThreadInteraction,
  AskUserQuestionsInteraction,
  AskUserQuestionsAnswer,
  CancelIssueThreadInteraction,
  CreateIssueThreadInteraction,
  IssueThreadInteraction,
  RejectIssueThreadInteraction,
  RequestConfirmationInteraction,
  RespondIssueThreadInteraction,
  SuggestTasksInteraction,
} from "@paperclipai/shared";
import {
  acceptIssueThreadInteractionSchema,
  askUserQuestionsPayloadSchema,
  askUserQuestionsResultSchema,
  cancelIssueThreadInteractionSchema,
  createIssueThreadInteractionSchema,
  rejectIssueThreadInteractionSchema,
  requestConfirmationPayloadSchema,
  requestConfirmationResultSchema,
  respondIssueThreadInteractionSchema,
  suggestTasksPayloadSchema,
  suggestTasksResultSchema,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";

type InteractionActor = {
  agentId?: string | null;
  userId?: string | null;
};

type IssueThreadInteractionRow = typeof issueThreadInteractions.$inferSelect;

const ISSUE_THREAD_INTERACTION_IDEMPOTENCY_CONSTRAINT =
  "issue_thread_interactions_company_issue_idempotency_uq";

function isIssueThreadInteractionIdempotencyConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: string; constraint?: string; constraint_name?: string };
  const constraint = err.constraint ?? err.constraint_name;
  return err.code === "23505" && constraint === ISSUE_THREAD_INTERACTION_IDEMPOTENCY_CONSTRAINT;
}

function isTerminalIssueStatus(status: string | null | undefined) {
  return status === "done" || status === "cancelled";
}

function assertIssueIsOpen(issue: { status?: string | null }) {
  if (isTerminalIssueStatus(issue.status)) {
    throw conflict("Issue is terminal and cannot accept interaction changes");
  }
}

function openIssueSubquery(db: Db, issue: { id: string; companyId: string }) {
  return db
    .select({ id: issues.id })
    .from(issues)
    .where(and(
      eq(issues.id, issue.id),
      eq(issues.companyId, issue.companyId),
      ne(issues.status, "done"),
      ne(issues.status, "cancelled"),
    ));
}

function pendingOpenInteractionWhere(db: Db, issue: { id: string; companyId: string }, interactionId: string) {
  return and(
    eq(issueThreadInteractions.id, interactionId),
    eq(issueThreadInteractions.companyId, issue.companyId),
    eq(issueThreadInteractions.issueId, issue.id),
    eq(issueThreadInteractions.status, "pending"),
    inArray(issueThreadInteractions.issueId, openIssueSubquery(db, issue)),
  );
}

async function throwResolutionWriteConflict(db: Db, issue: { id: string; companyId: string }) {
  const currentIssue = await db
    .select({ status: issues.status })
    .from(issues)
    .where(and(eq(issues.id, issue.id), eq(issues.companyId, issue.companyId)))
    .then((rows) => rows[0] ?? null);

  if (isTerminalIssueStatus(currentIssue?.status)) {
    throw conflict("Issue is terminal and cannot accept interaction changes");
  }
  throw conflict("Interaction has already been resolved");
}

function isEquivalentCreateRequest(
  row: IssueThreadInteractionRow,
  input: CreateIssueThreadInteraction,
  actor: InteractionActor,
) {
  return (
    row.kind === input.kind
    && row.continuationPolicy === input.continuationPolicy
    && (row.idempotencyKey ?? null) === (input.idempotencyKey ?? null)
    && (row.sourceCommentId ?? null) === (input.sourceCommentId ?? null)
    && (row.sourceRunId ?? null) === (input.sourceRunId ?? null)
    && (row.title ?? null) === (input.title ?? null)
    && (row.summary ?? null) === (input.summary ?? null)
    && (row.createdByAgentId ?? null) === (actor.agentId ?? null)
    && (row.createdByUserId ?? null) === (actor.userId ?? null)
    && isDeepStrictEqual(row.payload, input.payload)
  );
}

function hydrateInteraction(row: IssueThreadInteractionRow): IssueThreadInteraction {
  const base = {
    ...row,
    idempotencyKey: row.idempotencyKey ?? null,
    continuationPolicy: row.continuationPolicy as IssueThreadInteraction["continuationPolicy"],
    status: row.status as IssueThreadInteraction["status"],
  };

  switch (row.kind) {
    case "suggest_tasks":
      return {
        ...base,
        kind: "suggest_tasks",
        payload: suggestTasksPayloadSchema.parse(row.payload),
        result: row.result ? suggestTasksResultSchema.parse(row.result) : null,
      } satisfies SuggestTasksInteraction;
    case "ask_user_questions":
      return {
        ...base,
        kind: "ask_user_questions",
        payload: askUserQuestionsPayloadSchema.parse(row.payload),
        result: row.result ? askUserQuestionsResultSchema.parse(row.result) : null,
      } satisfies AskUserQuestionsInteraction;
    case "request_confirmation":
      return {
        ...base,
        kind: "request_confirmation",
        payload: requestConfirmationPayloadSchema.parse(row.payload),
        result: row.result ? requestConfirmationResultSchema.parse(row.result) : null,
      } satisfies RequestConfirmationInteraction;
    default:
      throw unprocessable(`Unknown interaction kind: ${row.kind}`);
  }
}

async function touchIssue(db: Pick<Db, "update">, issueId: string) {
  await db
    .update(issues)
    .set({ updatedAt: new Date() })
    .where(eq(issues.id, issueId));
}

async function lockOpenIssueForInteractionMutation(
  db: Pick<Db, "update">,
  issue: { id: string; companyId: string },
) {
  const [openIssue] = await db
    .update(issues)
    .set({ updatedAt: new Date() })
    .where(and(
      eq(issues.id, issue.id),
      eq(issues.companyId, issue.companyId),
      ne(issues.status, "done"),
      ne(issues.status, "cancelled"),
    ))
    .returning({ id: issues.id });

  if (!openIssue) {
    throw conflict("Issue is terminal and cannot accept interaction changes");
  }
}

function normalizeQuestionAnswers(args: {
  questions: AskUserQuestionsInteraction["payload"]["questions"];
  answers: RespondIssueThreadInteraction["answers"];
}) {
  const questionById = new Map(args.questions.map((question) => [question.id, question] as const));
  const answerByQuestionId = new Map<string, AskUserQuestionsAnswer>();

  for (const answer of args.answers) {
    const question = questionById.get(answer.questionId);
    if (!question) {
      throw unprocessable(`Unknown questionId: ${answer.questionId}`);
    }
    if (answerByQuestionId.has(answer.questionId)) {
      throw unprocessable(`Duplicate answer for questionId: ${answer.questionId}`);
    }

    const uniqueOptionIds = [...new Set(answer.optionIds)];
    const validOptionIds = new Set(question.options.map((option) => option.id));
    for (const optionId of uniqueOptionIds) {
      if (!validOptionIds.has(optionId)) {
        throw unprocessable(`Unknown optionId for question ${answer.questionId}: ${optionId}`);
      }
    }

    if (question.selectionMode === "single" && uniqueOptionIds.length > 1) {
      throw unprocessable(`Question ${answer.questionId} only allows one answer`);
    }

    answerByQuestionId.set(answer.questionId, {
      questionId: answer.questionId,
      optionIds: uniqueOptionIds,
    });
  }

  for (const question of args.questions) {
    const answer = answerByQuestionId.get(question.id);
    if (question.required && (!answer || answer.optionIds.length === 0)) {
      throw unprocessable(`Question ${question.id} requires an answer`);
    }
  }

  return args.questions
    .map((question) => answerByQuestionId.get(question.id))
    .filter((answer): answer is AskUserQuestionsAnswer => Boolean(answer));
}

export function issueThreadInteractionService(db: Db) {
  async function getIdempotentInteraction(args: {
    issueId: string;
    companyId: string;
    idempotencyKey: string;
  }, dbOrTx: Db = db) {
    return dbOrTx
      .select()
      .from(issueThreadInteractions)
      .where(and(
        eq(issueThreadInteractions.companyId, args.companyId),
        eq(issueThreadInteractions.issueId, args.issueId),
        eq(issueThreadInteractions.idempotencyKey, args.idempotencyKey),
      ))
      .then((rows) => rows[0] ?? null);
  }

  async function getPendingInteractionForResolution(args: {
    issue: { id: string; companyId: string; status?: string | null };
    interactionId: string;
  }) {
    assertIssueIsOpen(args.issue);
    const current = await db
      .select()
      .from(issueThreadInteractions)
      .where(eq(issueThreadInteractions.id, args.interactionId))
      .then((rows) => rows[0] ?? null);

    if (!current) throw notFound("Interaction not found");
    if (current.companyId !== args.issue.companyId || current.issueId !== args.issue.id) {
      throw notFound("Interaction not found");
    }
    if (current.status !== "pending") {
      throw conflict("Interaction has already been resolved");
    }
    return current;
  }

  return {
    listForIssue: async (issue: { id: string; companyId: string }) => {
      const rows = await db
        .select()
        .from(issueThreadInteractions)
        .where(and(
          eq(issueThreadInteractions.companyId, issue.companyId),
          eq(issueThreadInteractions.issueId, issue.id),
        ))
        .orderBy(asc(issueThreadInteractions.createdAt), asc(issueThreadInteractions.id));
      return rows.map(hydrateInteraction);
    },

    create: async (
      issue: { id: string; companyId: string; status?: string | null },
      input: CreateIssueThreadInteraction,
      actor: InteractionActor,
    ) => {
      assertIssueIsOpen(issue);
      const data = createIssueThreadInteractionSchema.parse(input);

      return db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        await lockOpenIssueForInteractionMutation(txDb, issue);

        if (data.idempotencyKey) {
          const existing = await getIdempotentInteraction({
            issueId: issue.id,
            companyId: issue.companyId,
            idempotencyKey: data.idempotencyKey,
          }, txDb);
          if (existing) {
            if (!isEquivalentCreateRequest(existing, data, actor)) {
              throw conflict("Interaction idempotency key already exists for a different request", {
                idempotencyKey: data.idempotencyKey,
              });
            }
            return hydrateInteraction(existing);
          }
        }

        if (data.sourceCommentId) {
          const sourceComment = await txDb
            .select({
              companyId: issueComments.companyId,
              issueId: issueComments.issueId,
            })
            .from(issueComments)
            .where(eq(issueComments.id, data.sourceCommentId))
            .then((rows) => rows[0] ?? null);
          if (!sourceComment || sourceComment.companyId !== issue.companyId || sourceComment.issueId !== issue.id) {
            throw unprocessable("sourceCommentId must belong to the same issue and company");
          }
        }

        if (data.sourceRunId) {
          const sourceRun = await txDb
            .select({ companyId: heartbeatRuns.companyId })
            .from(heartbeatRuns)
            .where(eq(heartbeatRuns.id, data.sourceRunId))
            .then((rows) => rows[0] ?? null);
          if (!sourceRun || sourceRun.companyId !== issue.companyId) {
            throw unprocessable("sourceRunId must belong to the same company");
          }
        }

        let created: IssueThreadInteractionRow;
        try {
          [created] = await txDb
            .insert(issueThreadInteractions)
            .values({
              companyId: issue.companyId,
              issueId: issue.id,
              kind: data.kind,
              status: "pending",
              continuationPolicy: data.continuationPolicy,
              idempotencyKey: data.idempotencyKey ?? null,
              sourceCommentId: data.sourceCommentId ?? null,
              sourceRunId: data.sourceRunId ?? null,
              title: data.title ?? null,
              summary: data.summary ?? null,
              createdByAgentId: actor.agentId ?? null,
              createdByUserId: actor.userId ?? null,
              payload: data.payload,
            })
            .returning();
        } catch (error) {
          if (!data.idempotencyKey || !isIssueThreadInteractionIdempotencyConflict(error)) {
            throw error;
          }
          const existing = await getIdempotentInteraction({
            issueId: issue.id,
            companyId: issue.companyId,
            idempotencyKey: data.idempotencyKey,
          }, txDb);
          if (!existing) throw error;
          if (!isEquivalentCreateRequest(existing, data, actor)) {
            throw conflict("Interaction idempotency key already exists for a different request", {
              idempotencyKey: data.idempotencyKey,
            });
          }
          return hydrateInteraction(existing);
        }

        return hydrateInteraction(created);
      });
    },

    answerQuestions: async (
      issue: { id: string; companyId: string; status?: string | null },
      interactionId: string,
      input: RespondIssueThreadInteraction,
      actor: InteractionActor,
    ) => {
      const data = respondIssueThreadInteractionSchema.parse(input);
      const current = await getPendingInteractionForResolution({ issue, interactionId });
      if (current.kind !== "ask_user_questions") {
        throw unprocessable("Only ask_user_questions interactions can be answered");
      }

      const interaction = hydrateInteraction(current) as AskUserQuestionsInteraction;
      const answers = normalizeQuestionAnswers({
        questions: interaction.payload.questions,
        answers: data.answers,
      });
      const now = new Date();
      const [updated] = await db
        .update(issueThreadInteractions)
        .set({
          status: "answered",
          result: {
            version: 1,
            answers,
            summaryMarkdown: data.summaryMarkdown ?? null,
          },
          resolvedByAgentId: actor.agentId ?? null,
          resolvedByUserId: actor.userId ?? null,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(pendingOpenInteractionWhere(db, issue, interactionId))
        .returning();

      if (!updated) {
        await throwResolutionWriteConflict(db, issue);
      }

      await touchIssue(db, issue.id);
      return hydrateInteraction(updated);
    },

    acceptInteraction: async (
      issue: { id: string; companyId: string; status?: string | null },
      interactionId: string,
      input: AcceptIssueThreadInteraction,
      actor: InteractionActor,
    ) => {
      acceptIssueThreadInteractionSchema.parse(input);
      const current = await getPendingInteractionForResolution({ issue, interactionId });
      if (current.kind !== "request_confirmation") {
        throw unprocessable(`Interactions of kind ${current.kind} cannot be accepted`);
      }

      const now = new Date();
      const [updated] = await db
        .update(issueThreadInteractions)
        .set({
          status: "accepted",
          result: {
            version: 1,
            outcome: "accepted",
          },
          resolvedByAgentId: actor.agentId ?? null,
          resolvedByUserId: actor.userId ?? null,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(pendingOpenInteractionWhere(db, issue, interactionId))
        .returning();

      if (!updated) {
        await throwResolutionWriteConflict(db, issue);
      }

      await touchIssue(db, issue.id);
      return hydrateInteraction(updated);
    },

    rejectInteraction: async (
      issue: { id: string; companyId: string; status?: string | null },
      interactionId: string,
      input: RejectIssueThreadInteraction,
      actor: InteractionActor,
    ) => {
      const data = rejectIssueThreadInteractionSchema.parse(input);
      const current = await getPendingInteractionForResolution({ issue, interactionId });
      if (current.kind !== "request_confirmation" && current.kind !== "suggest_tasks") {
        throw unprocessable(`Interactions of kind ${current.kind} cannot be rejected`);
      }

      const reason = data.reason?.trim() || null;
      const interaction = hydrateInteraction(current);
      if (
        interaction.kind === "request_confirmation" &&
        interaction.payload.rejectRequiresReason === true &&
        !reason
      ) {
        throw unprocessable("A decline reason is required for this confirmation");
      }

      const now = new Date();
      const result = interaction.kind === "request_confirmation"
        ? { version: 1 as const, outcome: "rejected" as const, reason }
        : { version: 1 as const, rejectionReason: reason };
      const [updated] = await db
        .update(issueThreadInteractions)
        .set({
          status: "rejected",
          result,
          resolvedByAgentId: actor.agentId ?? null,
          resolvedByUserId: actor.userId ?? null,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(pendingOpenInteractionWhere(db, issue, interactionId))
        .returning();

      if (!updated) {
        await throwResolutionWriteConflict(db, issue);
      }

      await touchIssue(db, issue.id);
      return hydrateInteraction(updated);
    },

    cancelQuestions: async (
      issue: { id: string; companyId: string; status?: string | null },
      interactionId: string,
      input: CancelIssueThreadInteraction,
      actor: InteractionActor,
    ) => {
      assertIssueIsOpen(issue);
      const data = cancelIssueThreadInteractionSchema.parse(input);
      const current = await db
        .select()
        .from(issueThreadInteractions)
        .where(eq(issueThreadInteractions.id, interactionId))
        .then((rows) => rows[0] ?? null);

      if (!current) throw notFound("Interaction not found");
      if (current.companyId !== issue.companyId || current.issueId !== issue.id) {
        throw notFound("Interaction not found");
      }
      if (current.kind !== "ask_user_questions") {
        throw unprocessable("Only ask_user_questions interactions can be cancelled");
      }
      if (current.status !== "pending") {
        throw conflict("Interaction has already been resolved");
      }

      const reason = data.reason?.trim() || null;
      const now = new Date();
      const [updated] = await db
        .update(issueThreadInteractions)
        .set({
          status: "cancelled",
          result: {
            version: 1,
            answers: [],
            cancelled: true,
            cancellationReason: reason,
            summaryMarkdown: null,
          },
          resolvedByAgentId: actor.agentId ?? null,
          resolvedByUserId: actor.userId ?? null,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(pendingOpenInteractionWhere(db, issue, interactionId))
        .returning();

      if (!updated) {
        await throwResolutionWriteConflict(db, issue);
      }

      await touchIssue(db, issue.id);
      return hydrateInteraction(updated);
    },
  };
}
