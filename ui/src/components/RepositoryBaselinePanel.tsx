import type { ReactNode } from "react";
import { type RepositoryDocumentationBaseline } from "@paperclipai/shared";
import { FileSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RepositoryDocumentationBaselineForm,
  RepositoryDocumentationBaselineStatus,
} from "../lib/repository-documentation-baseline";

type RepositoryBaselinePanelProps = {
  baseline: RepositoryDocumentationBaseline | null;
  form: RepositoryDocumentationBaselineForm;
  isRefreshing: boolean;
  actionMessage: string | null;
  onRefresh: () => void;
  onChange: (form: RepositoryDocumentationBaselineForm) => void;
};

function BaselineField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        {hint ? <span className="text-[11px] leading-relaxed text-muted-foreground sm:text-right">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function RepositoryBaselinePanel({
  baseline,
  form,
  isRefreshing,
  actionMessage,
  onRefresh,
  onChange,
}: RepositoryBaselinePanelProps) {
  const updatedAtLabel = formatUpdatedAt(baseline?.updatedAt);
  const hasRepositoryIdentityOnly = Boolean(baseline?.repository?.repoUrl) && !baseline?.repository?.cwd;
  const gaps = baseline?.gaps?.filter((gap) => gap.trim().length > 0) ?? [];

  const updateForm = (patch: Partial<RepositoryDocumentationBaselineForm>) => {
    onChange({ ...form, ...patch });
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Repository documentation baseline
          </div>
          <h2 className="text-lg font-semibold">Paperclip-owned repo context</h2>
          <p className="text-sm text-muted-foreground">
            Store read-only repository context for future delegation. This section is documentation state only:
            it does not create issues, split work, wake agents, import tickets, open PRs, or write to the repository.
          </p>
          {baseline ? (
            <p className="text-xs text-muted-foreground">
              Source: <span className="font-medium">{baseline.source}</span>
              {updatedAtLabel ? <> · Updated {updatedAtLabel}</> : null}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isRefreshing}
          onClick={onRefresh}
        >
          {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
          Refresh baseline
        </Button>
      </div>
      {actionMessage ? (
        <p className="mt-3 text-sm text-muted-foreground">{actionMessage}</p>
      ) : null}
      {hasRepositoryIdentityOnly ? (
        <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          This workspace has a repo URL but no local path. Paperclip recorded repository identity only; add a local path
          before refreshing if you want documentation and stack files scanned.
        </div>
      ) : null}
      {gaps.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-background/70 px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Documentation gaps</div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        <BaselineField label="Baseline status">
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            value={form.status}
            onChange={(event) =>
              updateForm({ status: event.target.value as RepositoryDocumentationBaselineStatus })
            }
          >
            <option value="not_started">Not started</option>
            <option value="ready">Ready</option>
            <option value="failed">Needs attention</option>
          </select>
        </BaselineField>

        <BaselineField label="Summary" hint="High-level repository facts, not implementation tasks.">
          <textarea
            className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            value={form.summary}
            onChange={(event) => updateForm({ summary: event.target.value })}
            placeholder="Stack, repo shape, important docs, and context future agents should read before taking work."
          />
        </BaselineField>

        <div className="grid gap-4 md:grid-cols-2">
          <BaselineField label="Stack signals" hint="One item per line, or comma-separated.">
            <textarea
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              value={form.stack}
              onChange={(event) => updateForm({ stack: event.target.value })}
              placeholder={"TypeScript\nReact\nExpress\nDrizzle"}
            />
          </BaselineField>
          <BaselineField label="Documentation files" hint="Paperclip context files to inspect first.">
            <textarea
              className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none"
              value={form.documentationFiles}
              onChange={(event) => updateForm({ documentationFiles: event.target.value })}
              placeholder={"AGENTS.md\nCLAUDE.md\nREADME.md\ndoc/PRODUCT.md"}
            />
          </BaselineField>
        </div>

        <BaselineField label="Guardrails" hint="These are saved with the baseline and should stay conservative.">
          <textarea
            className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            value={form.guardrails}
            onChange={(event) => updateForm({ guardrails: event.target.value })}
          />
        </BaselineField>
      </div>
    </div>
  );
}
