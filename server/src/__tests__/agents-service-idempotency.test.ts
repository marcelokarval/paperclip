import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { agentService } from "../services/agents.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres agent service idempotency tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("agent service idempotency", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-agent-idempotency-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("finds compatible non-terminated agent creations by persisted idempotency metadata", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const svc = agentService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Designer",
      role: "designer",
      status: "idle",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
      metadata: {
        paperclipIdempotency: {
          key: "explicit:hire-designer",
          requestHash: "request-hash",
          version: 1,
        },
      },
    });

    const match = await svc.findCompatibleCreate(companyId, {
      key: "explicit:hire-designer",
      requestHash: "request-hash",
    });
    const mismatch = await svc.findCompatibleCreate(companyId, {
      key: "explicit:hire-designer",
      requestHash: "different-request",
    });

    expect(match?.id).toBe(agentId);
    expect(match?.urlKey).toBe("designer");
    expect(mismatch).toBeNull();
  });

  it("serializes concurrent idempotent creates and returns the same agent", async () => {
    const companyId = randomUUID();
    const svc = agentService(db);
    const idempotency = {
      key: "explicit:concurrent-designer",
      requestHash: "request-hash",
    };

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    const createInput = {
      name: "Designer",
      role: "designer",
      status: "idle",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
      metadata: {
        paperclipIdempotency: {
          ...idempotency,
          version: 1,
        },
      },
    };

    const [first, second] = await Promise.all([
      svc.createIdempotent(companyId, createInput, idempotency),
      svc.createIdempotent(companyId, createInput, idempotency),
    ]);
    const rows = await db.select().from(agents).where(eq(agents.companyId, companyId));

    expect(rows).toHaveLength(1);
    expect(first.agent.id).toBe(second.agent.id);
    expect([first.reused, second.reused].sort()).toEqual([false, true]);
    expect(rows[0]?.name).toBe("Designer");
  });
});
