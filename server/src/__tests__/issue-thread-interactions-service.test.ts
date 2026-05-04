import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
  }) {
    const [row] = await db.insert(issueThreadInteractions).values({
      companyId: input.companyId,
      issueId: input.issueId,
      kind: input.kind ?? "ask_user_questions",
      status: input.status ?? "pending",
      continuationPolicy: "wake_assignee",
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
