import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Loader2, Target } from "lucide-react";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";

type ProjectSuggestedGoalsPanelProps = {
  project: Pick<Project, "id" | "operatingContext">;
  showHeader?: boolean;
};

export function ProjectSuggestedGoalsPanel({
  project,
  showHeader = true,
}: ProjectSuggestedGoalsPanelProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const suggestedGoals = project.operatingContext?.suggestedGoals ?? [];

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
    }
  };

  const acceptSuggestedGoal = useMutation({
    mutationFn: async (input: { key: string; title?: string | null; description?: string | null }) => {
      if (!selectedCompanyId) throw new Error("Select a company before accepting a suggested goal.");
      return projectsApi.acceptSuggestedGoal(
        project.id,
        input.key,
        {
          title: input.title ?? undefined,
          description: input.description ?? undefined,
        },
        selectedCompanyId,
      );
    },
    onSuccess: invalidateProject,
  });

  const rejectSuggestedGoal = useMutation({
    mutationFn: async (key: string) => {
      if (!selectedCompanyId) throw new Error("Select a company before rejecting a suggested goal.");
      return projectsApi.rejectSuggestedGoal(project.id, key, selectedCompanyId);
    },
    onSuccess: invalidateProject,
  });

  if (suggestedGoals.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {showHeader ? (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Suggested goals</div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Target className="h-4 w-4" />
            Promote repo-context suggestions into explicit project goals
          </div>
          <p className="text-sm text-muted-foreground">
            These come from the accepted repository context and belong in intake/staffing, not buried in stable configuration.
          </p>
        </div>
      ) : null}

      <div className={showHeader ? "mt-4 space-y-3" : "space-y-3"}>
        {suggestedGoals.map((goal) => {
          const isAccepted = goal.status === "accepted";
          const isRejected = goal.status === "rejected";
          const accepting = acceptSuggestedGoal.isPending && acceptSuggestedGoal.variables?.key === goal.key;
          const rejecting = rejectSuggestedGoal.isPending && rejectSuggestedGoal.variables === goal.key;
          return (
            <div key={goal.key} className="rounded-xl border border-border/70 bg-background/60 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium text-foreground">{goal.title}</div>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {goal.status}
                    </span>
                  </div>
                  {goal.description ? <p className="text-sm text-muted-foreground">{goal.description}</p> : null}
                  {goal.reason ? <p className="text-xs text-muted-foreground">{goal.reason}</p> : null}
                  {goal.suggestedVerificationCommands.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Suggested verification</div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {goal.suggestedVerificationCommands.map((entry) => (
                          <div key={entry} className="font-mono break-all">{entry}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {goal.recommendedLabels.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {goal.recommendedLabels.map((label) => (
                        <span key={label} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {goal.acceptedGoalId ? (
                    <div className="text-xs text-muted-foreground">
                      Linked goal:{" "}
                      <Link to={`/goals/${goal.acceptedGoalId}`} className="hover:underline">
                        {goal.acceptedGoalId}
                      </Link>
                    </div>
                  ) : null}
                </div>

                {!isAccepted && !isRejected ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-7 px-2"
                      disabled={accepting || rejecting}
                      onClick={() =>
                        acceptSuggestedGoal.mutate({
                          key: goal.key,
                          title: goal.title,
                          description: goal.description ?? null,
                        })}
                    >
                      {accepting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Accept as goal
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-7 px-2"
                      disabled={accepting || rejecting}
                      onClick={() => rejectSuggestedGoal.mutate(goal.key)}
                    >
                      {rejecting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {acceptSuggestedGoal.isError ? (
        <p className="mt-3 text-xs text-destructive">
          {acceptSuggestedGoal.error instanceof Error ? acceptSuggestedGoal.error.message : "Failed to accept suggested goal."}
        </p>
      ) : null}
      {rejectSuggestedGoal.isError ? (
        <p className="mt-3 text-xs text-destructive">
          {rejectSuggestedGoal.error instanceof Error ? rejectSuggestedGoal.error.message : "Failed to reject suggested goal."}
        </p>
      ) : null}
    </div>
  );
}
