import type { ReactNode } from "react";
import { type RepositoryDocumentationBaseline } from "@paperclipai/shared";
import { CheckCircle2, FileSearch, Loader2, Sparkles, Tags, TicketPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RepositoryDocumentationBaselineForm,
  RepositoryDocumentationBaselineStatus,
} from "../lib/repository-documentation-baseline";
import { describeRepositoryBaselineAnalyzerOutcome } from "../lib/repository-documentation-baseline";
import { Link } from "../lib/router";
import { issueUrl } from "../lib/utils";

type RepositoryBaselinePanelProps = {
  baseline: RepositoryDocumentationBaseline | null;
  form: RepositoryDocumentationBaselineForm;
  isRefreshing: boolean;
  actionMessage: string | null;
  onRefresh: (options?: { createTrackingIssue?: boolean; runAnalyzer?: boolean }) => void;
  onRunAnalyzer?: () => void;
  onApplyRecommendations?: () => void;
  onChange: (form: RepositoryDocumentationBaselineForm) => void;
  actionSurface?: "primary" | "support";
  intakeHref?: string | null;
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
  onRunAnalyzer,
  onApplyRecommendations,
  onChange,
  actionSurface = "primary",
  intakeHref,
}: RepositoryBaselinePanelProps) {
  const updatedAtLabel = formatUpdatedAt(baseline?.updatedAt);
  const hasRepositoryIdentityOnly = Boolean(baseline?.repository?.repoUrl) && !baseline?.repository?.cwd;
  const gaps = baseline?.gaps?.filter((gap) => gap.trim().length > 0) ?? [];
  const trackingIssueRef = baseline?.trackingIssueId
    ? {
        id: baseline.trackingIssueId,
        identifier: baseline.trackingIssueIdentifier ?? baseline.trackingIssueId,
      }
    : null;
  const suggestedLabels = baseline?.recommendations?.labels ?? [];
  const acceptedLabels = baseline?.acceptedGuidance?.labels ?? [];
  const issuePolicy = baseline?.acceptedGuidance?.issuePolicy ?? baseline?.recommendations?.issuePolicy ?? null;
  const projectDefaults = baseline?.acceptedGuidance?.projectDefaults ?? baseline?.recommendations?.projectDefaults ?? null;
  const hasRecommendations =
    suggestedLabels.length > 0 ||
    Boolean(issuePolicy) ||
    Boolean(projectDefaults);
  const analyzerOutcome = describeRepositoryBaselineAnalyzerOutcome(baseline?.analysis);
  const showAnalyzerDiagnostics = baseline?.analysis
    ? baseline.analysis.status !== "succeeded" || Boolean(baseline.analysis.rawOutput)
    : false;

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
        {actionSurface === "primary" ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isRefreshing}
              onClick={() => onRefresh()}
            >
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
              Refresh baseline
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={isRefreshing}
              onClick={() => onRefresh({ createTrackingIssue: true })}
            >
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TicketPlus className="mr-2 h-4 w-4" />}
              Create operator issue
            </Button>
            {onRunAnalyzer ? (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isRefreshing}
                onClick={onRunAnalyzer}
              >
                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Run AI enrichment
              </Button>
            ) : null}
            {hasRecommendations && onApplyRecommendations ? (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isRefreshing}
                onClick={onApplyRecommendations}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Apply recommendations
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            {intakeHref ? (
              <Button asChild type="button" variant="secondary" className="w-full sm:w-auto">
                <Link to={intakeHref}>Open Project Intake</Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {actionMessage ? (
        <p className="mt-3 text-sm text-muted-foreground">{actionMessage}</p>
      ) : null}
      <div className="mt-3 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">Operator workflow</div>
        <p className="mt-1">
          {actionSurface === "primary"
            ? "The operator issue is a single tracking artifact for this baseline. Apply recommendations only projects baseline context into the project. CEO review and repository-context acceptance happen before staffing. Execution clarifications are optional hardening for a tighter operator contract; they should not block the first CTO brief."
            : "This workspace now acts as a technical support surface. Use Project Intake for the primary operator flow: baseline actions, CEO review, repository acceptance, clarifications, and staffing."}
        </p>
        {trackingIssueRef ? (
          <Link className="mt-2 inline-flex text-sm font-medium text-primary hover:underline" to={issueUrl(trackingIssueRef)}>
            Open {trackingIssueRef.identifier}
          </Link>
        ) : null}
        {actionSurface === "support" && intakeHref ? (
          <Link className="mt-2 ml-3 inline-flex text-sm font-medium text-primary hover:underline" to={intakeHref}>
            Open Project Intake
          </Link>
        ) : null}
      </div>
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

      {baseline?.analysis ? (
        <div className="mt-3 rounded-xl border border-border bg-background/70 px-3 py-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              AI analyzer enrichment
            </div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {baseline.analysis.status}
            </span>
          </div>
          {analyzerOutcome ? (
            <p className="mt-2 text-sm text-muted-foreground">{analyzerOutcome}</p>
          ) : null}
          {baseline.analysis.summary ? (
            <p className="mt-2 text-sm text-muted-foreground">{baseline.analysis.summary}</p>
          ) : null}
          {baseline.analysis.error ? (
            <p className="mt-2 text-sm text-destructive">{baseline.analysis.error}</p>
          ) : null}
          {baseline.analysis.changes.appliedChanges.length > 0 ? (
            <div className="mt-2">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Applied changes
              </div>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {baseline.analysis.changes.appliedChanges.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            </div>
          ) : null}
          {baseline.analysis.changes.noOpReason ? (
            <p className="mt-2 text-sm text-muted-foreground">{baseline.analysis.changes.noOpReason}</p>
          ) : null}
          {baseline.analysis.risks.length > 0 ? (
            <div className="mt-2">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Analyzer risks
              </div>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {baseline.analysis.risks.map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            </div>
          ) : null}
          {baseline.analysis.agentGuidance.length > 0 ? (
            <div className="mt-2">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Agent guidance
              </div>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {baseline.analysis.agentGuidance.slice(0, 6).map((entry) => <li key={entry}>{entry}</li>)}
              </ul>
            </div>
          ) : null}
          {showAnalyzerDiagnostics ? (
            <details className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Show analyzer diagnostics
              </summary>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div>
                  <span className="font-medium text-foreground">Provider:</span> {baseline.analysis.provider}
                </div>
                <div>
                  <span className="font-medium text-foreground">Command:</span> {baseline.analysis.command ?? "unknown"}
                </div>
                <div>
                  <span className="font-medium text-foreground">Duration:</span> {Math.max(0, Math.round(baseline.analysis.durationMs / 100) / 10)}s
                </div>
              </div>
              {baseline.analysis.rawOutput ? (
                <div className="mt-2">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Raw output excerpt
                  </div>
                  <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-border bg-background px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                    {baseline.analysis.rawOutput}
                  </pre>
                </div>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : null}

      {hasRecommendations ? (
        <div className="mt-3 rounded-xl border border-border bg-background/70 px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Operational recommendations
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Suggested project configuration from the read-only baseline. Applying these creates missing labels
                and accepts issue guidance for future agent context; it still does not create work or wake agents.
              </p>
            </div>
            {baseline?.acceptedGuidance ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Accepted
              </span>
            ) : null}
          </div>

          {suggestedLabels.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Tags className="h-4 w-4" />
                Suggested labels
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {suggestedLabels.map((label) => {
                  const accepted = acceptedLabels.some((entry) => entry.name === label.name);
                  return (
                    <div key={label.name} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: label.color }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium">{label.name}</span>
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          {accepted ? "accepted" : label.confidence}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{label.description}</p>
                      {label.evidence.length > 0 ? (
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          Evidence: {label.evidence.slice(0, 3).join(", ")}
                          {label.evidence.length > 3 ? "..." : ""}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {issuePolicy ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="text-sm font-medium">Issue relation policy</div>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                  {[...issuePolicy.parentChildGuidance, ...issuePolicy.blockingGuidance].slice(0, 5).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="text-sm font-medium">Review and approval policy</div>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                  {[...issuePolicy.reviewGuidance, ...issuePolicy.approvalGuidance].slice(0, 5).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {projectDefaults ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="text-sm font-medium">Project defaults for agent context</div>
              <div className="mt-2 grid gap-3 text-xs leading-relaxed text-muted-foreground md:grid-cols-2">
                <div>
                  <div className="font-medium text-foreground">Read first</div>
                  <ul className="mt-1 space-y-1">
                    {projectDefaults.canonicalDocs.slice(0, 6).map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-foreground">Verification</div>
                  <ul className="mt-1 space-y-1">
                    {projectDefaults.suggestedVerificationCommands.slice(0, 6).map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
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
