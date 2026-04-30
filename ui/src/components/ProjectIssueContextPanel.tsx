import type { Project } from "@paperclipai/shared";
import { getProjectIssueContextModel } from "../lib/project-operating-context";

export function ProjectIssueContextPanel({
  project,
  title = "Project context",
  className = "",
}: {
  project: Pick<Project, "issueSystemGuidance" | "operatingContext"> | null | undefined;
  title?: string;
  className?: string;
}) {
  const context = getProjectIssueContextModel(project);
  if (!context) return null;

  return (
    <div className={`space-y-3 rounded-md border border-border/70 bg-muted/20 px-3 py-3 ${className}`.trim()}>
      <div>
        <div className="text-xs font-medium">{title}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Promoted project defaults for labels, docs, verification, routing, and review behavior.
        </p>
      </div>

      {context.labelCatalog.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Labels</div>
          <div className="flex flex-wrap gap-1">
            {context.labelCatalog.map((label) => (
              <span
                key={label.name}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                {label.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {context.canonicalDocs.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Docs</div>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            {context.canonicalDocs.map((doc) => (
              <div key={doc} className="font-mono break-all">{doc}</div>
            ))}
          </div>
        </div>
      ) : null}

      {context.verificationCommands.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Verification</div>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            {context.verificationCommands.map((command) => (
              <div key={command} className="font-mono break-all">{command}</div>
            ))}
          </div>
        </div>
      ) : null}

      {context.ownershipAreas.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ownership</div>
          <div className="space-y-2">
            {context.ownershipAreas.map((area, index) => (
              <div key={`${area.name}:${area.paths.join("|")}:${index}`} className="rounded-md border border-border/70 bg-background px-2 py-1.5">
                <div className="text-xs font-medium">{area.name}</div>
                {area.paths.length > 0 ? (
                  <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                    {area.paths.map((entry) => (
                      <div key={entry} className="font-mono break-all">{entry}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {context.operatingGuidance.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Operating guidance</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {context.operatingGuidance.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.labelUsageGuidance.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Label guidance</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {context.labelUsageGuidance.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.parentChildGuidance.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Parent / sub-issues</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {context.parentChildGuidance.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.blockingGuidance.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Blocking</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {context.blockingGuidance.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.reviewGuidance.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Review</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {context.reviewGuidance.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.approvalGuidance.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Approval</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {context.approvalGuidance.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
