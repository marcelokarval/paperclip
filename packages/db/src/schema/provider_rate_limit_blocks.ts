import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";

export const providerRateLimitBlocks = pgTable(
  "provider_rate_limit_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    provider: text("provider").notNull(),
    adapterType: text("adapter_type").notNull(),
    limitKind: text("limit_kind").notNull(),
    modelFamily: text("model_family"),
    resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    sourceIssueId: uuid("source_issue_id").references(() => issues.id, { onDelete: "set null" }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyActiveIdx: index("provider_rate_limit_blocks_company_active_idx")
      .on(table.companyId, table.releasedAt),
    activeUniqueIdx: uniqueIndex("provider_rate_limit_blocks_active_uq")
      .on(
        table.companyId,
        table.provider,
        table.adapterType,
        table.limitKind,
        sql`coalesce(${table.modelFamily}, '')`,
      )
      .where(sql`${table.releasedAt} is null`),
  }),
);

