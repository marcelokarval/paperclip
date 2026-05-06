import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  agentWakeupRequests,
  companies,
  createDb,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres wakeup coalescing tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat wakeup coalescing", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let paperclipHome = "";
  const previousPaperclipHome = process.env.PAPERCLIP_HOME;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-heartbeat-wakeup-coalescing-");
    db = createDb(tempDb.connectionString);
    paperclipHome = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-heartbeat-wakeup-home-"));
    process.env.PAPERCLIP_HOME = paperclipHome;
  }, 45_000);

  afterEach(async () => {
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
    if (paperclipHome) {
      fs.rmSync(paperclipHome, { recursive: true, force: true });
    }
    if (previousPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = previousPaperclipHome;
  });

  async function createCompanyAgent() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "idle",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    return { companyId, agentId, issuePrefix };
  }

  async function createWakeRun(input: {
    companyId: string;
    agentId: string;
    status: "queued" | "running";
    contextSnapshot: Record<string, unknown>;
    reason?: string;
  }) {
    const runId = randomUUID();
    const wakeupRequestId = randomUUID();

    await db.insert(agentWakeupRequests).values({
      id: wakeupRequestId,
      companyId: input.companyId,
      agentId: input.agentId,
      source: "automation",
      triggerDetail: "system",
      reason: input.reason ?? "manual",
      payload: {},
      status: input.status === "queued" ? "queued" : "started",
      runId,
    });

    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId: input.companyId,
      agentId: input.agentId,
      invocationSource: "automation",
      triggerDetail: "system",
      status: input.status,
      wakeupRequestId,
      contextSnapshot: input.contextSnapshot,
      startedAt: input.status === "running" ? new Date() : null,
    });

    return { runId, wakeupRequestId };
  }

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  it("coalesces issue-scoped mention wakes under the issue-lock path", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const runId = randomUUID();
    const wakeupRequestId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const wakeCommentId = randomUUID();
    const heartbeat = heartbeatService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "idle",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Mention wake coalescing",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      issueNumber: 1,
      identifier: `${issuePrefix}-1`,
    });

    await db.insert(agentWakeupRequests).values({
      id: wakeupRequestId,
      companyId,
      agentId,
      source: "automation",
      triggerDetail: "system",
      reason: "issue_comment_mentioned",
      payload: { issueId },
      status: "queued",
      runId,
    });

    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "automation",
      triggerDetail: "system",
      status: "queued",
      wakeupRequestId,
      contextSnapshot: {
        issueId,
        wakeReason: "issue_comment_mentioned",
      },
    });

    const run = await heartbeat.wakeup(agentId, {
      source: "automation",
      triggerDetail: "system",
      reason: "issue_comment_mentioned",
      payload: { issueId, commentId: wakeCommentId },
      contextSnapshot: {
        issueId,
        wakeReason: "issue_comment_mentioned",
      },
      requestedByActorType: "user",
      requestedByActorId: "user-1",
    });

    expect(run?.id).toBe(runId);

    const mergedRun = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0] ?? null);
    const mergedContext = (mergedRun?.contextSnapshot ?? {}) as Record<string, unknown>;

    expect(mergedContext).toMatchObject({
      issueId,
      taskId: issueId,
      taskKey: issueId,
      commentId: wakeCommentId,
      wakeCommentId,
      wakeReason: "issue_comment_mentioned",
      wakeSource: "automation",
      wakeTriggerDetail: "system",
    });
    expect(mergedContext.wakeCommentIds).toEqual([wakeCommentId]);

    const coalescedWake = await db
      .select()
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, companyId),
          eq(agentWakeupRequests.agentId, agentId),
          eq(agentWakeupRequests.status, "coalesced"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    expect(coalescedWake?.runId).toBe(runId);
    expect(coalescedWake?.reason).toBe("issue_execution_same_name");
  });

  it("coalesces generic same-scope wakes using the enriched wake context", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const wakeupRequestId = randomUUID();
    const wakeCommentId = randomUUID();
    const taskKey = `task-${companyId}`;
    const heartbeat = heartbeatService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "idle",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(agentWakeupRequests).values({
      id: wakeupRequestId,
      companyId,
      agentId,
      source: "automation",
      triggerDetail: "system",
      reason: "issue_comment_mentioned",
      payload: { taskKey },
      status: "queued",
      runId,
    });

    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "automation",
      triggerDetail: "system",
      status: "queued",
      wakeupRequestId,
      contextSnapshot: {
        taskKey,
        wakeReason: "issue_comment_mentioned",
      },
    });

    const run = await heartbeat.wakeup(agentId, {
      source: "automation",
      triggerDetail: "system",
      reason: "issue_comment_mentioned",
      payload: { taskKey, commentId: wakeCommentId },
      contextSnapshot: {
        taskKey,
        wakeReason: "issue_comment_mentioned",
      },
      requestedByActorType: "user",
      requestedByActorId: "user-1",
    });

    expect(run?.id).toBe(runId);

    const mergedRun = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0] ?? null);
    const mergedContext = (mergedRun?.contextSnapshot ?? {}) as Record<string, unknown>;

    expect(mergedContext).toMatchObject({
      taskKey,
      commentId: wakeCommentId,
      wakeCommentId,
      wakeReason: "issue_comment_mentioned",
      wakeSource: "automation",
      wakeTriggerDetail: "system",
    });
    expect(mergedContext.wakeCommentIds).toEqual([wakeCommentId]);

    const coalescedWake = await db
      .select()
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, companyId),
          eq(agentWakeupRequests.agentId, agentId),
          eq(agentWakeupRequests.status, "coalesced"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    expect(coalescedWake?.runId).toBe(runId);
    expect(coalescedWake?.reason).toBe("issue_comment_mentioned");
  });

  it("coalesces an undirected manual wake into an active issue-scoped running run", async () => {
    const { companyId, agentId, issuePrefix } = await createCompanyAgent();
    const issueId = randomUUID();
    const heartbeat = heartbeatService(db);

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Issue scoped active run",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      issueNumber: 2,
      identifier: `${issuePrefix}-2`,
    });

    const { runId } = await createWakeRun({
      companyId,
      agentId,
      status: "running",
      contextSnapshot: {
        issueId,
        taskId: issueId,
        taskKey: issueId,
        wakeReason: "manual",
      },
    });

    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual",
      requestedByActorType: "user",
      requestedByActorId: "user-1",
    });

    expect(run?.id).toBe(runId);

    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(runs).toHaveLength(1);

    const coalescedWake = await db
      .select()
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, companyId),
          eq(agentWakeupRequests.agentId, agentId),
          eq(agentWakeupRequests.status, "coalesced"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    expect(coalescedWake?.runId).toBe(runId);
  });

  it("coalesces an undirected wake into an existing queued run", async () => {
    const { companyId, agentId } = await createCompanyAgent();
    const heartbeat = heartbeatService(db);

    const { runId } = await createWakeRun({
      companyId,
      agentId,
      status: "queued",
      contextSnapshot: {
        taskKey: `task-${companyId}`,
        wakeReason: "manual",
      },
    });

    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual",
      requestedByActorType: "user",
      requestedByActorId: "user-1",
    });

    expect(run?.id).toBe(runId);

    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("queued");
  });

  it("keeps directed different task scopes as separate queued runs", async () => {
    const { companyId, agentId } = await createCompanyAgent();
    const heartbeat = heartbeatService(db);

    const { runId: runningRunId } = await createWakeRun({
      companyId,
      agentId,
      status: "running",
      contextSnapshot: {
        taskKey: "task-a",
        wakeReason: "manual",
      },
    });

    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual",
      payload: { taskKey: "task-b" },
      contextSnapshot: { taskKey: "task-b" },
      requestedByActorType: "user",
      requestedByActorId: "user-1",
    });

    expect(run?.id).not.toBe(runningRunId);
    expect(run?.status).toBe("queued");

    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(runs).toHaveLength(2);
    expect(runs.map((candidate) => candidate.status).sort()).toEqual(["queued", "running"]);
  });

  it("coalesces concurrent undirected invokes into one active run", async () => {
    const { companyId, agentId } = await createCompanyAgent();
    const heartbeat = heartbeatService(db);

    const { runId } = await createWakeRun({
      companyId,
      agentId,
      status: "running",
      contextSnapshot: {
        taskKey: `issue-${companyId}`,
        wakeReason: "manual",
      },
    });

    const runs = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        heartbeat.wakeup(agentId, {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "manual",
          requestedByActorType: "user",
          requestedByActorId: `user-${index}`,
        }),
      ),
    );

    expect(runs.map((run) => run?.id)).toEqual(Array(5).fill(runId));

    const activeRuns = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(activeRuns).toHaveLength(1);

    const coalescedWakes = await db
      .select()
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, companyId),
          eq(agentWakeupRequests.agentId, agentId),
          eq(agentWakeupRequests.status, "coalesced"),
        ),
      );
    expect(coalescedWakes).toHaveLength(5);
  });

  it("queues a comment wake follow-up instead of swallowing it into a running generic run", async () => {
    const { companyId, agentId } = await createCompanyAgent();
    const heartbeat = heartbeatService(db);

    const { runId: runningRunId } = await createWakeRun({
      companyId,
      agentId,
      status: "running",
      contextSnapshot: {
        taskKey: "task-with-comments",
        wakeReason: "manual",
      },
    });

    const commentId = randomUUID();
    const run = await heartbeat.wakeup(agentId, {
      source: "automation",
      triggerDetail: "system",
      reason: "issue_comment_mentioned",
      payload: { taskKey: "task-with-comments", commentId },
      contextSnapshot: { taskKey: "task-with-comments" },
      requestedByActorType: "user",
      requestedByActorId: "user-1",
    });

    expect(run?.id).not.toBe(runningRunId);
    expect(run?.status).toBe("queued");

    const activeRuns = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(activeRuns).toHaveLength(2);
    expect(activeRuns.map((candidate) => candidate.status).sort()).toEqual(["queued", "running"]);
  });

  it("skips a non-issue wake when the agent is paused before the locked insert path", async () => {
    const { companyId, agentId } = await createCompanyAgent();
    const heartbeat = heartbeatService(db);

    let wakePromise: ReturnType<typeof heartbeat.wakeup> | undefined;
    await db.transaction(async (tx) => {
      await tx
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .for("update");

      wakePromise = heartbeat.wakeup(agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "manual",
        requestedByActorType: "user",
        requestedByActorId: "user-1",
      });
      await delay(50);
      await tx
        .update(agents)
        .set({ pausedAt: new Date("2026-03-19T00:10:00.000Z") })
        .where(eq(agents.id, agentId));
    });
    const wakeResult = await wakePromise;

    expect(wakeResult).toBeNull();

    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(runs).toHaveLength(0);

    const skippedWake = await db
      .select()
      .from(agentWakeupRequests)
      .where(and(eq(agentWakeupRequests.agentId, agentId), eq(agentWakeupRequests.status, "skipped")))
      .then((rows) => rows[0] ?? null);
    expect(skippedWake?.reason).toBe("agent_not_invokable");
    expect(skippedWake?.runId).toBeNull();
  });

  it("skips an issue wake when the agent is paused before the locked issue insert path", async () => {
    const { companyId, agentId, issuePrefix } = await createCompanyAgent();
    const issueId = randomUUID();
    const heartbeat = heartbeatService(db);

    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Race issue",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
      issueNumber: 3,
      identifier: `${issuePrefix}-3`,
    });

    let wakePromise: ReturnType<typeof heartbeat.wakeup> | undefined;
    await db.transaction(async (tx) => {
      await tx
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .for("update");

      wakePromise = heartbeat.wakeup(agentId, {
        source: "automation",
        triggerDetail: "system",
        reason: "issue_assigned",
        payload: { issueId, taskKey: issueId },
        contextSnapshot: { issueId, taskId: issueId, taskKey: issueId },
      });
      await delay(50);
      await tx
        .update(agents)
        .set({ status: "paused", pausedAt: new Date("2026-03-19T00:10:00.000Z") })
        .where(eq(agents.id, agentId));
    });
    const wakeResult = await wakePromise;

    expect(wakeResult).toBeNull();

    const runs = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.agentId, agentId));
    expect(runs).toHaveLength(0);

    const issue = await db.select().from(issues).where(eq(issues.id, issueId)).then((rows) => rows[0] ?? null);
    expect(issue?.executionRunId).toBeNull();

    const skippedWake = await db
      .select()
      .from(agentWakeupRequests)
      .where(and(eq(agentWakeupRequests.agentId, agentId), eq(agentWakeupRequests.status, "skipped")))
      .then((rows) => rows[0] ?? null);
    expect(skippedWake?.reason).toBe("agent_not_invokable");
    expect(skippedWake?.runId).toBeNull();
  });
});
