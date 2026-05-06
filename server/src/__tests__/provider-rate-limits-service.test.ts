import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  companies,
  createDb,
  issues,
  providerRateLimitBlocks,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { providerRateLimitService } from "../services/provider-rate-limits.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping provider rate-limit tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("providerRateLimitService", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-provider-rate-limits-");
    db = createDb(database.connectionString);
  }, 30_000);

  afterAll(async () => {
    await database?.cleanup();
  });

  it("blocks and deterministically releases expired provider limits without quota APIs", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const agentId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Rate Limit Co", issuePrefix: `RL${companyId.slice(0, 4)}` });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Claude Opus",
      role: "engineer",
      adapterType: "claude_local",
      adapterConfig: { model: "claude-opus-4-1" },
      status: "idle",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Implement task",
      status: "in_progress",
      assigneeAgentId: agentId,
    });

    const service = providerRateLimitService(db);
    const block = await service.recordBlock({
      companyId,
      runId: null,
      issueId,
      block: {
        provider: "anthropic",
        adapterType: "claude_local",
        limitKind: "opus_weekly",
        modelFamily: "opus",
        resetsAt: "2026-05-05T18:00:00.000Z",
      },
    });

    expect(block?.id).toEqual(expect.any(String));
    await expect(db.select().from(agents).where(eq(agents.id, agentId))).resolves.toMatchObject([
      { status: "paused", pauseReason: "provider_rate_limit" },
    ]);
    await expect(db.select().from(issues).where(eq(issues.id, issueId))).resolves.toMatchObject([
      { status: "blocked" },
    ]);

    const released = await service.releaseExpired(new Date("2026-05-05T18:00:01.000Z"));

    expect(released).toHaveLength(1);
    await expect(db.select().from(agents).where(eq(agents.id, agentId))).resolves.toMatchObject([
      { status: "idle", pauseReason: null },
    ]);
    await expect(db.select().from(issues).where(eq(issues.id, issueId))).resolves.toMatchObject([
      { status: "todo" },
    ]);
  });

  it("verifies company ownership before release mutation", async () => {
    const ownerCompanyId = randomUUID();
    const otherCompanyId = randomUUID();
    await db.insert(companies).values([
      { id: ownerCompanyId, name: "Owner Co", issuePrefix: `OW${ownerCompanyId.slice(0, 4)}` },
      { id: otherCompanyId, name: "Other Co", issuePrefix: `OT${otherCompanyId.slice(0, 4)}` },
    ]);
    const [block] = await db.insert(providerRateLimitBlocks).values({
      companyId: ownerCompanyId,
      provider: "openai",
      adapterType: "codex_local",
      limitKind: "usage_limit",
      resetsAt: new Date("2026-05-05T18:00:00.000Z"),
    }).returning();

    const service = providerRateLimitService(db);
    await expect(service.releaseBlock(otherCompanyId, block.id, "manual")).resolves.toBeNull();
    await expect(db.select().from(providerRateLimitBlocks).where(eq(providerRateLimitBlocks.id, block.id)))
      .resolves.toMatchObject([{ releasedAt: null }]);
  });
});
