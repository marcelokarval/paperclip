import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, issueThreadInteractions } from "@paperclipai/db";
import type {
  AskUserQuestionsInteraction,
  CancelIssueThreadInteraction,
  IssueThreadInteraction,
} from "@paperclipai/shared";
import {
  askUserQuestionsPayloadSchema,
  askUserQuestionsResultSchema,
  cancelIssueThreadInteractionSchema,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";

type InteractionActor = {
  agentId?: string | null;
  userId?: string | null;
};

type IssueThreadInteractionRow = typeof issueThreadInteractions.$inferSelect;

function hydrateInteraction(row: IssueThreadInteractionRow): IssueThreadInteraction {
  const base = {
    ...row,
    idempotencyKey: row.idempotencyKey ?? null,
    continuationPolicy: row.continuationPolicy as IssueThreadInteraction["continuationPolicy"],
    status: row.status as IssueThreadInteraction["status"],
  };

  if (row.kind !== "ask_user_questions") {
    throw unprocessable(`Unknown interaction kind: ${row.kind}`);
  }

  return {
    ...base,
    kind: "ask_user_questions",
    payload: askUserQuestionsPayloadSchema.parse(row.payload),
    result: row.result ? askUserQuestionsResultSchema.parse(row.result) : null,
  } satisfies AskUserQuestionsInteraction;
}

async function touchIssue(db: Pick<Db, "update">, issueId: string) {
  await db
    .update(issues)
    .set({ updatedAt: new Date() })
    .where(eq(issues.id, issueId));
}

export function issueThreadInteractionService(db: Db) {
  return {
    listForIssue: async (issue: { id: string; companyId: string }) => {
      const rows = await db
        .select()
        .from(issueThreadInteractions)
        .where(and(
          eq(issueThreadInteractions.companyId, issue.companyId),
          eq(issueThreadInteractions.issueId, issue.id),
        ))
        .orderBy(issueThreadInteractions.createdAt);
      return rows.map(hydrateInteraction);
    },

    cancelQuestions: async (
      issue: { id: string; companyId: string },
      interactionId: string,
      input: CancelIssueThreadInteraction,
      actor: InteractionActor,
    ) => {
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
        .where(and(
          eq(issueThreadInteractions.id, interactionId),
          eq(issueThreadInteractions.status, "pending"),
        ))
        .returning();

      if (!updated) {
        throw conflict("Interaction has already been resolved");
      }

      await touchIssue(db, issue.id);
      return hydrateInteraction(updated);
    },
  };
}
