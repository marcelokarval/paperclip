import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  companies,
  createDb,
  issueThreadInteractions,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueThreadInteractionService } from "../services/issue-thread-interactions.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres issue-thread interaction service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueThreadInteractionService cancellation", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-thread-interactions-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueThreadInteractions);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedIssue(overrides: { companyId?: string; issueId?: string } = {}) {
    const companyId = overrides.companyId ?? randomUUID();
    const issueId = overrides.issueId ?? randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: `Company ${companyId.slice(0, 6)}`,
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Question parent",
      status: "in_review",
      priority: "medium",
    });
    return { companyId, issueId };
  }

  async function seedInteraction(input: {
    companyId: string;
    issueId: string;
    kind?: string;
    status?: string;
    payload?: Record<string, unknown>;
  }) {
    const [row] = await db.insert(issueThreadInteractions).values({
      companyId: input.companyId,
      issueId: input.issueId,
      kind: input.kind ?? "ask_user_questions",
      status: input.status ?? "pending",
      continuationPolicy: "wake_assignee",
      payload: input.payload ?? {
        version: 1,
        questions: [{
          id: "scope",
          prompt: "Choose the scope",
          selectionMode: "single",
          required: true,
          options: [{ id: "phase-1", label: "Phase 1" }],
        }],
      },
      result: input.status === "answered"
        ? {
            version: 1,
            answers: [{ questionId: "scope", optionIds: ["phase-1"] }],
            summaryMarkdown: null,
          }
        : null,
    }).returning();
    return row!;
  }

  it("creates supported interactions idempotently", async () => {
    const issue = await seedIssue();
    const service = issueThreadInteractionService(db);
    const input = {
      kind: "ask_user_questions" as const,
      idempotencyKey: "ask-scope",
      payload: {
        version: 1 as const,
        questions: [{
          id: "scope",
          prompt: "Choose the scope",
          selectionMode: "single" as const,
          required: true,
          options: [{ id: "phase-1", label: "Phase 1" }],
        }],
      },
    };

    const first = await service.create(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      input,
      { userId: "local-board" },
    );
    const second = await service.create(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      input,
      { userId: "local-board" },
    );

    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      kind: "ask_user_questions",
      status: "pending",
      idempotencyKey: "ask-scope",
      continuationPolicy: "wake_assignee",
      createdByUserId: "local-board",
    });

    await expect(service.create(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      {
        ...input,
        title: "Different title",
      },
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 409,
      message: "Interaction idempotency key already exists for a different request",
    });
  });

  it("uses the current DB issue status when creating interactions", async () => {
    const issue = await seedIssue();
    const service = issueThreadInteractionService(db);

    await db
      .update(issues)
      .set({ status: "done" })
      .where(eq(issues.id, issue.issueId));

    await expect(service.create(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      {
        kind: "ask_user_questions",
        payload: {
          version: 1,
          questions: [{
            id: "scope",
            prompt: "Choose the scope",
            selectionMode: "single",
            required: true,
            options: [{ id: "phase-1", label: "Phase 1" }],
          }],
        },
      },
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 409,
      message: "Issue is terminal and cannot accept interaction changes",
    });

    await expect(db.select().from(issueThreadInteractions)).resolves.toEqual([]);
  });

  it("blocks idempotent create retries after the issue becomes terminal", async () => {
    const issue = await seedIssue();
    const service = issueThreadInteractionService(db);
    const input = {
      kind: "ask_user_questions" as const,
      idempotencyKey: "terminal-retry",
      payload: {
        version: 1 as const,
        questions: [{
          id: "scope",
          prompt: "Choose the scope",
          selectionMode: "single" as const,
          required: true,
          options: [{ id: "phase-1", label: "Phase 1" }],
        }],
      },
    };

    const created = await service.create(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      input,
      { userId: "local-board" },
    );

    await db
      .update(issues)
      .set({ status: "done" })
      .where(eq(issues.id, issue.issueId));

    await expect(service.create(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      input,
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 409,
      message: "Issue is terminal and cannot accept interaction changes",
    });

    await expect(db.select().from(issueThreadInteractions)).resolves.toHaveLength(1);
    const rows = await db.select().from(issueThreadInteractions);
    expect(rows[0]?.id).toBe(created.id);
  });

  it("answers ask_user_questions and normalizes selections", async () => {
    const issue = await seedIssue();
    const interaction = await seedInteraction({
      ...issue,
      payload: {
        version: 1,
        questions: [{
          id: "scope",
          prompt: "Choose the scope",
          selectionMode: "multi",
          required: true,
          options: [
            { id: "phase-1", label: "Phase 1" },
            { id: "phase-2", label: "Phase 2" },
          ],
        }],
      },
    });

    const answered = await issueThreadInteractionService(db).answerQuestions(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      interaction.id,
      {
        answers: [{ questionId: "scope", optionIds: ["phase-1", "phase-1", "phase-2"] }],
        summaryMarkdown: "Do both phases.",
      },
      { userId: "local-board" },
    );

    expect(answered).toMatchObject({
      id: interaction.id,
      status: "answered",
      result: {
        version: 1,
        answers: [{ questionId: "scope", optionIds: ["phase-1", "phase-2"] }],
        summaryMarkdown: "Do both phases.",
      },
      resolvedByUserId: "local-board",
    });

    await expect(issueThreadInteractionService(db).answerQuestions(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      interaction.id,
      { answers: [{ questionId: "scope", optionIds: ["phase-1"] }] },
      { userId: "local-board" },
    )).rejects.toMatchObject({ status: 409, message: "Interaction has already been resolved" });
  });

  it("rejects invalid question answers", async () => {
    const issue = await seedIssue();
    const interaction = await seedInteraction(issue);

    await expect(issueThreadInteractionService(db).answerQuestions(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      interaction.id,
      { answers: [{ questionId: "scope", optionIds: ["phase-2"] }] },
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 422,
      message: "Unknown optionId for question scope: phase-2",
    });
  });

  it("accepts and rejects request confirmations", async () => {
    const issue = await seedIssue();
    const acceptInteraction = await seedInteraction({
      ...issue,
      kind: "request_confirmation",
      payload: { version: 1, prompt: "Approve?", rejectRequiresReason: true },
    });
    const accepted = await issueThreadInteractionService(db).acceptInteraction(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      acceptInteraction.id,
      {},
      { userId: "local-board" },
    );

    expect(accepted).toMatchObject({
      kind: "request_confirmation",
      status: "accepted",
      result: { version: 1, outcome: "accepted" },
    });

    const rejectInteraction = await seedInteraction({
      ...issue,
      kind: "request_confirmation",
      payload: { version: 1, prompt: "Approve?", rejectRequiresReason: true },
    });
    await expect(issueThreadInteractionService(db).rejectInteraction(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      rejectInteraction.id,
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 422,
      message: "A decline reason is required for this confirmation",
    });

    const rejected = await issueThreadInteractionService(db).rejectInteraction(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      rejectInteraction.id,
      { reason: "Needs more evidence" },
      { userId: "local-board" },
    );
    expect(rejected).toMatchObject({
      kind: "request_confirmation",
      status: "rejected",
      result: { version: 1, outcome: "rejected", reason: "Needs more evidence" },
    });
  });

  it("rejects unsupported accept paths and terminal issue lifecycle changes", async () => {
    const issue = await seedIssue();
    const askInteraction = await seedInteraction(issue);

    await expect(issueThreadInteractionService(db).acceptInteraction(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      askInteraction.id,
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 422,
      message: "Interactions of kind ask_user_questions cannot be accepted",
    });

    await expect(issueThreadInteractionService(db).answerQuestions(
      { id: issue.issueId, companyId: issue.companyId, status: "done" },
      askInteraction.id,
      { answers: [{ questionId: "scope", optionIds: ["phase-1"] }] },
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 409,
      message: "Issue is terminal and cannot accept interaction changes",
    });
  });

  it("uses the current DB issue status when resolving stale pending interactions", async () => {
    const issue = await seedIssue();
    const interaction = await seedInteraction(issue);

    await db
      .update(issues)
      .set({ status: "done" })
      .where(eq(issues.id, issue.issueId));

    await expect(issueThreadInteractionService(db).answerQuestions(
      { id: issue.issueId, companyId: issue.companyId, status: "in_review" },
      interaction.id,
      { answers: [{ questionId: "scope", optionIds: ["phase-1"] }] },
      { userId: "local-board" },
    )).rejects.toMatchObject({
      status: 409,
      message: "Issue is terminal and cannot accept interaction changes",
    });

    const rows = await db
      .select()
      .from(issueThreadInteractions)
      .where(eq(issueThreadInteractions.id, interaction.id));
    expect(rows[0]).toMatchObject({
      status: "pending",
      result: null,
      resolvedAt: null,
    });
  });

  it("returns 404 when the interaction is missing", async () => {
    const { companyId, issueId } = await seedIssue();

    await expect(issueThreadInteractionService(db).cancelQuestions(
      { id: issueId, companyId },
      randomUUID(),
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({ status: 404, message: "Interaction not found" });
  });

  it("returns 404 for cross-company or cross-issue interaction access", async () => {
    const first = await seedIssue();
    const second = await seedIssue();
    const interaction = await seedInteraction(first);

    await expect(issueThreadInteractionService(db).cancelQuestions(
      { id: second.issueId, companyId: second.companyId },
      interaction.id,
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({ status: 404, message: "Interaction not found" });
  });

  it("returns 409 when the interaction is not pending", async () => {
    const issue = await seedIssue();
    const interaction = await seedInteraction({ ...issue, status: "answered" });

    await expect(issueThreadInteractionService(db).cancelQuestions(
      { id: issue.issueId, companyId: issue.companyId },
      interaction.id,
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({ status: 409, message: "Interaction has already been resolved" });
  });

  it("returns 422 for unsupported interaction kinds", async () => {
    const issue = await seedIssue();
    const interaction = await seedInteraction({ ...issue, kind: "request_confirmation" });

    await expect(issueThreadInteractionService(db).cancelQuestions(
      { id: issue.issueId, companyId: issue.companyId },
      interaction.id,
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({ status: 422, message: "Only ask_user_questions interactions can be cancelled" });
  });

  it("cancels pending questions and rejects a second cancellation", async () => {
    const issue = await seedIssue();
    const interaction = await seedInteraction(issue);

    const cancelled = await issueThreadInteractionService(db).cancelQuestions(
      { id: issue.issueId, companyId: issue.companyId },
      interaction.id,
      { reason: "Not needed anymore" },
      { userId: "local-board" },
    );

    expect(cancelled).toMatchObject({
      id: interaction.id,
      status: "cancelled",
      continuationPolicy: "wake_assignee",
      result: {
        version: 1,
        answers: [],
        cancelled: true,
        cancellationReason: "Not needed anymore",
        summaryMarkdown: null,
      },
      resolvedByUserId: "local-board",
    });

    const rows = await db.select().from(issueThreadInteractions);
    expect(rows[0]).toMatchObject({
      id: interaction.id,
      status: "cancelled",
      resolvedByUserId: "local-board",
    });
    expect(rows[0]?.resolvedAt).toBeInstanceOf(Date);

    await expect(issueThreadInteractionService(db).cancelQuestions(
      { id: issue.issueId, companyId: issue.companyId },
      interaction.id,
      {},
      { userId: "local-board" },
    )).rejects.toMatchObject({ status: 409, message: "Interaction has already been resolved" });
  });
});
