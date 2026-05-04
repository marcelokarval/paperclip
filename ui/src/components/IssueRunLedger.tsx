import { useMemo, type ReactNode } from "react";
import type { ActivityEvent, Agent, IssueThreadInteraction } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import type { RunForIssue } from "../api/activity";
import { cn, relativeTime } from "../lib/utils";
import { IssueThreadInteractionCard } from "./IssueThreadInteractionCard";

type IssueRunLedgerContentProps = {
  runs: RunForIssue[];
  interactions?: IssueThreadInteraction[];
  activityEvents?: ActivityEvent[];
  agentMap: ReadonlyMap<string, Pick<Agent, "name">>;
  renderActivityEvent?: (event: ActivityEvent) => ReactNode;
  cancellingInteractionId?: string | null;
  onCancelInteraction?: (interaction: IssueThreadInteraction) => Promise<void> | void;
};

type LedgerFeedItem =
  | { kind: "run"; id: string; timestamp: string; run: RunForIssue }
  | { kind: "interaction"; id: string; timestamp: string; interaction: IssueThreadInteraction }
  | { kind: "activity"; id: string; timestamp: string; event: ActivityEvent };

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function compactAgentName(run: RunForIssue, agentMap: ReadonlyMap<string, Pick<Agent, "name">>) {
  return agentMap.get(run.agentId)?.name ?? run.agentId.slice(0, 8);
}

function formatDuration(start: string | Date | null | undefined, end: string | Date | null | undefined) {
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function stopReasonLabel(run: RunForIssue) {
  const result = run.resultJson;
  const stopReason = typeof result?.stopReason === "string" ? result.stopReason : null;
  if (stopReason === "timeout") return "timeout";
  if (stopReason === "budget_paused") return "budget paused";
  if (stopReason === "cancelled") return "cancelled";
  if (stopReason === "paused") return "paused by board";
  return run.status === "queued" || run.status === "running" ? "Still running" : "Unavailable";
}

function sortFeedItems(items: LedgerFeedItem[]) {
  return items.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    if (aTime !== bTime) return bTime - aTime;
    const order = { interaction: 0, run: 1, activity: 2 };
    if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
    return b.id.localeCompare(a.id);
  });
}

export function IssueRunLedgerContent({
  runs,
  interactions,
  activityEvents,
  agentMap,
  renderActivityEvent,
  cancellingInteractionId = null,
  onCancelInteraction,
}: IssueRunLedgerContentProps) {
  const feedItems = useMemo<LedgerFeedItem[]>(() => {
    const items: LedgerFeedItem[] = [];
    for (const run of runs) {
      items.push({
        kind: "run",
        id: run.runId,
        timestamp: run.startedAt ?? run.createdAt,
        run,
      });
    }
    for (const interaction of interactions ?? []) {
      items.push({
        kind: "interaction",
        id: interaction.id,
        timestamp: interaction.createdAt instanceof Date
          ? interaction.createdAt.toISOString()
          : String(interaction.createdAt),
        interaction,
      });
    }
    if (renderActivityEvent) {
      for (const event of activityEvents ?? []) {
        items.push({
          kind: "activity",
          id: event.id,
          timestamp: event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : String(event.createdAt),
          event,
        });
      }
    }
    return sortFeedItems(items);
  }, [activityEvents, interactions, renderActivityEvent, runs]);

  const latestRun = runs[0] ?? null;

  return (
    <section className="space-y-3" aria-label="Issue run ledger">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">Run ledger</h3>
          <p className="text-xs text-muted-foreground">
            {latestRun
              ? `${statusLabel(latestRun.status)} by ${compactAgentName(latestRun, agentMap)}`
              : "Runs, activity, and workflow questions will appear here once this issue has history."}
          </p>
        </div>
        {latestRun ? (
          <Link
            to={`/agents/${latestRun.agentId}/runs/${latestRun.runId}`}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Latest run
          </Link>
        ) : null}
      </div>

      {feedItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          Runs, activity, and workflow questions will appear here once this issue has history.
        </div>
      ) : (
        <div className="space-y-2">
          {feedItems.slice(0, 20).map((item) => {
            if (item.kind === "activity") {
              return <div key={`activity:${item.id}`}>{renderActivityEvent?.(item.event)}</div>;
            }
            if (item.kind === "interaction") {
              return (
                <IssueThreadInteractionCard
                  key={`interaction:${item.id}`}
                  interaction={item.interaction}
                  cancelling={cancellingInteractionId === item.interaction.id}
                  onCancelInteraction={onCancelInteraction}
                />
              );
            }
            const run = item.run;
            const agentName = compactAgentName(run, agentMap);
            const duration = formatDuration(run.startedAt, run.finishedAt);
            return (
              <article
                key={`run:${run.runId}`}
                className="space-y-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">Run</span>
                  <Link
                    to={`/agents/${run.agentId}/runs/${run.runId}`}
                    className="min-w-0 max-w-full truncate font-mono text-foreground hover:underline"
                  >
                    {run.runId.slice(0, 8)}
                  </Link>
                  <span>by {agentName}</span>
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">
                    {statusLabel(run.status)}
                  </span>
                  {(run.status === "queued" || run.status === "running") ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-700 dark:text-cyan-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                      live
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0">{relativeTime(item.timestamp)}</span>
                </div>
                <div className={cn("grid gap-2 sm:grid-cols-2", !duration && "sm:grid-cols-1")}>
                  {duration ? (
                    <div>
                      <span className="text-foreground">Elapsed</span> {duration}
                    </div>
                  ) : null}
                  <div>
                    <span className="text-foreground">Stop</span> {stopReasonLabel(run)}
                  </div>
                </div>
              </article>
            );
          })}
          {feedItems.length > 20 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {feedItems.length - 20} older items not shown
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
