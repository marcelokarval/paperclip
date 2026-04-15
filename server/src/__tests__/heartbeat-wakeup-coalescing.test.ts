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
  }, 20_000);

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
});
