import type { Project } from "@paperclipai/shared";
import { BriefcaseBusiness, FilePlus2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "../lib/router";
import { getProjectStaffingModel } from "../lib/project-operating-context";
import type { HiringBriefPreview } from "@paperclipai/shared";

interface ProjectStaffingPanelProps {
  project: Pick<Project, "operatingContext" | "staffingState">;
  companyPrefix?: string | null;
  baselineIssueIdentifierFallback?: string | null;
  onGenerateBrief?: () => void;
  onCreateHiringIssue?: () => void;
  isGeneratingBrief?: boolean;
  isCreatingHiringIssue?: boolean;
  preview?: HiringBriefPreview | null;
  previewOpen?: boolean;
  onPreviewOpenChange?: (open: boolean) => void;
}

function issueHref(companyPrefix: string | null | undefined, identifier: string | null) {
  if (!companyPrefix || !identifier) return null;
  return `/${companyPrefix}/issues/${identifier}`;
}

export function ProjectStaffingPanel({
  project,
  companyPrefix,
  baselineIssueIdentifierFallback,
  onGenerateBrief,
  onCreateHiringIssue,
  isGeneratingBrief = false,
  isCreatingHiringIssue = false,
  preview = null,
  previewOpen = false,
  onPreviewOpenChange,
}: ProjectStaffingPanelProps) {
  const staffing = getProjectStaffingModel(project);
  if (!staffing) return null;

  const baselineIssueIdentifier = staffing.baselineIssueIdentifier ?? baselineIssueIdentifierFallback ?? null;
  const baselineIssueHref = issueHref(companyPrefix, baselineIssueIdentifier);
  const hiringIssueHref = issueHref(companyPrefix, staffing.hiringIssueIdentifier);
  const roleLabel = staffing.recommendedRoleLabel ?? "technical";
  const hiringBriefActionLabel = staffing.recommendedRole === "cto"
    ? "Generate CTO hiring brief"
    : `Generate ${roleLabel} hiring brief`;
  const createHiringIssueActionLabel = staffing.recommendedRole === "cto"
    ? "Create CTO hiring issue"
    : `Create ${roleLabel} hiring issue`;

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Staffing</div>
            <h2 className="text-lg font-semibold">First technical hire</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Keep the baseline issue technical and canonical. Staffing starts from the accepted project context and emits a
              dedicated hiring issue instead of reusing the baseline thread.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            {staffing.statusLabel}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)]">
          <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Users className="h-4 w-4" />
              Recommended next role
            </div>
            <div className="mt-2 text-lg font-semibold">
              {staffing.recommendedRoleLabel ?? "No staffing recommendation yet"}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Paperclip is ready to generate a dedicated hiring brief once the accepted baseline and project operating context
              are stable enough for staffing. Open execution ambiguities can travel into the CTO brief instead of blocking the
              first hire. This preview turns the recommendation into a reviewable staffing artifact before any issue is created.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BriefcaseBusiness className="h-4 w-4" />
                Canonical links
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Baseline issue:</span>{" "}
                  {baselineIssueHref && baselineIssueIdentifier ? (
                    <Link to={baselineIssueHref} className="hover:underline">
                      {baselineIssueIdentifier}
                    </Link>
                  ) : (
                    baselineIssueIdentifier ?? "Not linked"
                  )}
                </div>
                <div>
                  <span className="font-medium text-foreground">Hiring issue:</span>{" "}
                  {hiringIssueHref && staffing.hiringIssueIdentifier ? (
                    <Link to={hiringIssueHref} className="hover:underline">
                      {staffing.hiringIssueIdentifier}
                    </Link>
                  ) : (
                    staffing.hiringIssueIdentifier ?? "Not created yet"
                  )}
                </div>
                {staffing.lastBriefGeneratedAt ? (
                  <div>
                    <span className="font-medium text-foreground">Last brief:</span> {staffing.lastBriefGeneratedAt}
                  </div>
                ) : null}
                <div>
                  <span className="font-medium text-foreground">Execution clarifications:</span>{" "}
                  {staffing.executionReadiness === "ready" ? "closed" : "open"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3">
              <div className="text-sm font-medium text-foreground">Next phase</div>
              <p className="mt-1 text-sm text-muted-foreground">
                `{hiringBriefActionLabel}` builds a preview from the accepted baseline, AI enrichment, operating context,
                and CEO refinement. It does not wake agents, create the agent, or approve a hire automatically.
              </p>
              {staffing.executionClarificationNote ? (
                <p className="mt-2 text-xs text-muted-foreground">{staffing.executionClarificationNote}</p>
              ) : null}
              {staffing.blockedReason ? (
                <p className="mt-2 text-xs text-muted-foreground">{staffing.blockedReason}</p>
              ) : null}
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!staffing.canGenerateBrief || !onGenerateBrief || isGeneratingBrief}
                  onClick={() => onGenerateBrief?.()}
                >
                  {isGeneratingBrief ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
                  {hiringBriefActionLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={onPreviewOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] grid-rows-none flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle>{preview?.title ?? "Hiring brief preview"}</DialogTitle>
            <DialogDescription>
              Review the derived staffing brief before creating the dedicated {roleLabel} hiring issue.
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Summary</div>
                <p className="mt-2 text-sm text-muted-foreground">{preview.summary}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <PreviewList title="Source signals" items={preview.sourceSignals} />
                <PreviewList title="Rationale" items={preview.rationale} />
                <PreviewList title="Project context" items={preview.projectContext} />
                <PreviewList title="Known risks and gaps" items={preview.risks} />
                <PreviewList title="Expected first output" items={preview.expectedFirstOutput} />
                <PreviewList title="Success criteria" items={preview.successCriteria} />
              </div>

              <PreviewList title="Guardrails" items={preview.guardrails} />

              <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Canonical references</div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {preview.canonicalReferences.map((reference: HiringBriefPreview["canonicalReferences"][number]) => (
                    <div key={`${reference.type}:${reference.label}:${reference.value}`}>
                      <span className="font-medium text-foreground">{reference.label}:</span> {reference.value}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter showCloseButton className="shrink-0 border-t border-border bg-background px-5 py-4">
            <Button
              type="button"
              onClick={() => onCreateHiringIssue?.()}
              disabled={!preview || !onCreateHiringIssue || isCreatingHiringIssue}
            >
              {isCreatingHiringIssue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
              {createHiringIssueActionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-background/70 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
