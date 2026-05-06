import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues, providerRateLimitBlocks } from "@paperclipai/db";
import type { AdapterProviderRateLimitBlock } from "@paperclipai/adapter-utils";
import type { ProviderRateLimitBlock } from "@paperclipai/shared";

const OPEN_ISSUE_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"] as const;

type ProviderRateLimitBlockRow = typeof providerRateLimitBlocks.$inferSelect;

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function toApiBlock(row: ProviderRateLimitBlockRow): ProviderRateLimitBlock {
  return {
    id: row.id,
    companyId: row.companyId,
    provider: row.provider,
    adapterType: row.adapterType,
    limitKind: row.limitKind,
    modelFamily: row.modelFamily,
    resetsAt: row.resetsAt.toISOString(),
    sourceRunId: row.sourceRunId,
    sourceIssueId: row.sourceIssueId,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    releaseReason: row.releaseReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function adapterConfigModelFamily(adapterConfig: unknown): string | null {
  if (typeof adapterConfig !== "object" || adapterConfig === null || Array.isArray(adapterConfig)) return null;
  const record = adapterConfig as Record<string, unknown>;
  const raw = typeof record.model === "string" ? record.model : typeof record.defaultModel === "string" ? record.defaultModel : null;
  const model = normalizeString(raw);
  if (!model) return null;
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("gpt-5")) return "gpt-5";
  if (model.includes("gpt-4")) return "gpt-4";
  return null;
}

function agentMatchesBlock(
  agent: Pick<typeof agents.$inferSelect, "adapterType" | "adapterConfig">,
  block: Pick<ProviderRateLimitBlockRow, "adapterType" | "modelFamily">,
): boolean {
  if (agent.adapterType !== block.adapterType) return false;
  const family = normalizeString(block.modelFamily);
  if (!family) return true;
  return adapterConfigModelFamily(agent.adapterConfig) === family;
}

function markIssueBlockedState(existing: unknown, blockId: string, resetsAt: Date) {
  const base = typeof existing === "object" && existing !== null && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return {
    ...base,
    providerRateLimitBlock: {
      id: blockId,
      resetsAt: resetsAt.toISOString(),
    },
  };
}

function issueHasBlockState(issue: Pick<typeof issues.$inferSelect, "executionState">, blockId: string): boolean {
  const state = issue.executionState;
  if (typeof state !== "object" || state === null || Array.isArray(state)) return false;
  const block = (state as Record<string, unknown>).providerRateLimitBlock;
  return typeof block === "object" && block !== null && !Array.isArray(block)
    && (block as Record<string, unknown>).id === blockId;
}

function clearIssueBlockState(existing: unknown, blockId: string) {
  if (typeof existing !== "object" || existing === null || Array.isArray(existing)) return existing;
  const next = { ...(existing as Record<string, unknown>) };
  const block = next.providerRateLimitBlock;
  if (
    typeof block === "object" &&
    block !== null &&
    !Array.isArray(block) &&
    (block as Record<string, unknown>).id === blockId
  ) {
    delete next.providerRateLimitBlock;
  }
  return next;
}

export function providerRateLimitService(db: Db) {
  async function listActive(companyId: string) {
    const rows = await db
      .select()
      .from(providerRateLimitBlocks)
      .where(and(eq(providerRateLimitBlocks.companyId, companyId), isNull(providerRateLimitBlocks.releasedAt)));
    return rows.map(toApiBlock);
  }

  async function pauseAgentsForBlock(block: ProviderRateLimitBlockRow) {
    const candidates = await db
      .select({
        id: agents.id,
        adapterType: agents.adapterType,
        adapterConfig: agents.adapterConfig,
        status: agents.status,
        pauseReason: agents.pauseReason,
      })
      .from(agents)
      .where(and(eq(agents.companyId, block.companyId), eq(agents.adapterType, block.adapterType)));

    const matchingIds = candidates
      .filter((agent) => agent.status !== "terminated")
      .filter((agent) => agentMatchesBlock(agent, block))
      .map((agent) => agent.id);

    if (matchingIds.length === 0) return 0;
    await db
      .update(agents)
      .set({
        status: "paused",
        pauseReason: "provider_rate_limit",
        pausedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agents.companyId, block.companyId), inArray(agents.id, matchingIds)));
    return matchingIds.length;
  }

  async function blockSourceIssue(block: ProviderRateLimitBlockRow) {
    if (!block.sourceIssueId) return false;
    const issue = await db
      .select({ id: issues.id, status: issues.status, executionState: issues.executionState })
      .from(issues)
      .where(and(eq(issues.companyId, block.companyId), eq(issues.id, block.sourceIssueId)))
      .then((rows) => rows[0] ?? null);
    if (!issue || issue.status === "done" || issue.status === "cancelled") return false;
    await db
      .update(issues)
      .set({
        status: "blocked",
        executionState: markIssueBlockedState(issue.executionState, block.id, block.resetsAt),
        updatedAt: new Date(),
      })
      .where(and(eq(issues.companyId, block.companyId), eq(issues.id, issue.id)));
    return true;
  }

  async function recordBlock(input: {
    companyId: string;
    runId: string | null;
    issueId: string | null;
    block: AdapterProviderRateLimitBlock;
  }) {
    const resetsAt = new Date(input.block.resetsAt);
    if (!Number.isFinite(resetsAt.getTime())) return null;

    const modelFamily = normalizeString(input.block.modelFamily);
    const existing = await db
      .select()
      .from(providerRateLimitBlocks)
      .where(and(
        eq(providerRateLimitBlocks.companyId, input.companyId),
        eq(providerRateLimitBlocks.provider, input.block.provider),
        eq(providerRateLimitBlocks.adapterType, input.block.adapterType),
        eq(providerRateLimitBlocks.limitKind, input.block.limitKind),
        modelFamily === null
          ? isNull(providerRateLimitBlocks.modelFamily)
          : eq(providerRateLimitBlocks.modelFamily, modelFamily),
        isNull(providerRateLimitBlocks.releasedAt),
      ))
      .then((rows) => rows[0] ?? null);

    const row = existing
      ? await db
        .update(providerRateLimitBlocks)
        .set({
          resetsAt,
          sourceRunId: input.runId,
          sourceIssueId: input.issueId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(providerRateLimitBlocks.companyId, input.companyId),
          eq(providerRateLimitBlocks.id, existing.id),
        ))
        .returning()
        .then((rows) => rows[0] ?? existing)
      : await db
        .insert(providerRateLimitBlocks)
        .values({
          companyId: input.companyId,
          provider: input.block.provider,
          adapterType: input.block.adapterType,
          limitKind: input.block.limitKind,
          modelFamily,
          resetsAt,
          sourceRunId: input.runId,
          sourceIssueId: input.issueId,
        })
        .returning()
        .then((rows) => rows[0] ?? null);

    if (!row) return null;
    await pauseAgentsForBlock(row);
    await blockSourceIssue(row);
    return toApiBlock(row);
  }

  async function releaseBlock(companyId: string, blockId: string, reason: "manual" | "expired" = "manual") {
    const block = await db
      .select()
      .from(providerRateLimitBlocks)
      .where(and(eq(providerRateLimitBlocks.companyId, companyId), eq(providerRateLimitBlocks.id, blockId)))
      .then((rows) => rows[0] ?? null);
    if (!block) return null;
    if (block.releasedAt) return toApiBlock(block);

    const now = new Date();
    const released = await db
      .update(providerRateLimitBlocks)
      .set({ releasedAt: now, releaseReason: reason, updatedAt: now })
      .where(and(eq(providerRateLimitBlocks.companyId, companyId), eq(providerRateLimitBlocks.id, blockId)))
      .returning()
      .then((rows) => rows[0] ?? { ...block, releasedAt: now, releaseReason: reason, updatedAt: now });

    const pausedCandidates = await db
      .select({ id: agents.id, adapterType: agents.adapterType, adapterConfig: agents.adapterConfig })
      .from(agents)
      .where(and(
        eq(agents.companyId, companyId),
        eq(agents.pauseReason, "provider_rate_limit"),
        eq(agents.status, "paused"),
      ));
    const remainingBlocks = await db
      .select()
      .from(providerRateLimitBlocks)
      .where(and(
        eq(providerRateLimitBlocks.companyId, companyId),
        eq(providerRateLimitBlocks.adapterType, block.adapterType),
        isNull(providerRateLimitBlocks.releasedAt),
      ));
    const resumableAgentIds = pausedCandidates
      .filter((agent) => agentMatchesBlock(agent, block))
      .filter((agent) => !remainingBlocks.some((remainingBlock) => agentMatchesBlock(agent, remainingBlock)))
      .map((agent) => agent.id);
    if (resumableAgentIds.length > 0) {
      await db
        .update(agents)
        .set({ status: "idle", pauseReason: null, pausedAt: null, updatedAt: now })
        .where(and(eq(agents.companyId, companyId), inArray(agents.id, resumableAgentIds)));
    }

    const blockedIssues = await db
      .select({ id: issues.id, executionState: issues.executionState })
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.status, "blocked")));
    const unblocked = blockedIssues.filter((issue) => issueHasBlockState(issue, block.id));
    for (const issue of unblocked) {
      await db
        .update(issues)
        .set({
          status: "todo",
          executionState: clearIssueBlockState(issue.executionState, block.id) as Record<string, unknown> | null,
          updatedAt: now,
        })
        .where(and(eq(issues.companyId, companyId), eq(issues.id, issue.id)));
    }

    return toApiBlock(released);
  }

  async function releaseExpired(now = new Date(), companyId?: string) {
    const predicates = [
      isNull(providerRateLimitBlocks.releasedAt),
      lte(providerRateLimitBlocks.resetsAt, now),
    ];
    if (companyId) predicates.push(eq(providerRateLimitBlocks.companyId, companyId));
    const expired = await db
      .select({ id: providerRateLimitBlocks.id, companyId: providerRateLimitBlocks.companyId })
      .from(providerRateLimitBlocks)
      .where(and(...predicates));
    const released: ProviderRateLimitBlock[] = [];
    for (const row of expired) {
      const block = await releaseBlock(row.companyId, row.id, "expired");
      if (block) released.push(block);
    }
    return released;
  }

  async function hasActiveBlockForAgent(agent: Pick<typeof agents.$inferSelect, "companyId" | "adapterType" | "adapterConfig">) {
    const active = await db
      .select()
      .from(providerRateLimitBlocks)
      .where(and(
        eq(providerRateLimitBlocks.companyId, agent.companyId),
        eq(providerRateLimitBlocks.adapterType, agent.adapterType),
        isNull(providerRateLimitBlocks.releasedAt),
      ));
    return active.find((block) => agentMatchesBlock(agent, block)) ?? null;
  }

  return {
    listActive,
    recordBlock,
    releaseBlock,
    releaseExpired,
    hasActiveBlockForAgent,
    OPEN_ISSUE_STATUSES,
  };
}
