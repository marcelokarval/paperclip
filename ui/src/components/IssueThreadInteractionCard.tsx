import type { AskUserQuestionsAnswer, IssueThreadInteraction } from "@paperclipai/shared";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime, formatShortDate } from "../lib/utils";
import {
  buildIssueThreadInteractionSummary,
  getQuestionAnswerLabels,
  issueThreadInteractionStatusLabel,
} from "../lib/issue-thread-interactions";

interface IssueThreadInteractionCardProps {
  interaction: IssueThreadInteraction;
  cancelling?: boolean;
  onCancelInteraction?: (interaction: IssueThreadInteraction) => Promise<void> | void;
}

function statusIcon(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "answered":
      return CheckCircle2;
    case "cancelled":
    case "failed":
      return XCircle;
    case "expired":
      return AlertTriangle;
    default:
      return CircleDashed;
  }
}

function statusClasses(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "answered":
      return {
        shell: "border-emerald-500/40 bg-emerald-500/5",
        badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "cancelled":
      return {
        shell: "border-rose-500/40 bg-rose-500/5",
        badge: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      };
    case "expired":
    case "failed":
      return {
        shell: "border-amber-500/40 bg-amber-500/5",
        badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    default:
      return {
        shell: "border-sky-500/40 bg-sky-500/5",
        badge: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      };
  }
}

export function IssueThreadInteractionCard({
  interaction,
  cancelling = false,
  onCancelInteraction,
}: IssueThreadInteractionCardProps) {
  const StatusIcon = statusIcon(interaction.status);
  const styles = statusClasses(interaction.status);
  const questions = interaction.payload.questions;
  const recordedAnswers: readonly AskUserQuestionsAnswer[] = interaction.result?.answers ?? [];

  return (
    <article className={cn("rounded-lg border p-4", styles.shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em]", styles.badge)}>
              <StatusIcon className="h-3.5 w-3.5" />
              Agent questions / {issueThreadInteractionStatusLabel(interaction.status)}
            </span>
            {interaction.continuationPolicy === "wake_assignee" ? (
              <span className="rounded-md border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                Wakes assignee
              </span>
            ) : null}
          </div>
          <h4 className="mt-2 text-sm font-semibold text-foreground">
            {interaction.title ?? interaction.payload.title ?? "Questions for the operator"}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {interaction.summary ?? buildIssueThreadInteractionSummary(interaction)}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground" title={formatDateTime(interaction.createdAt)}>
          {formatShortDate(interaction.createdAt)}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {questions.map((question) => {
          const labels = getQuestionAnswerLabels({
            question,
            answers: recordedAnswers,
          });
          return (
            <div key={question.id} className="rounded-md border border-border/70 bg-background/75 p-3">
              <div className="text-sm font-medium text-foreground">
                {question.prompt}
              </div>
              {question.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{question.description}</p>
              ) : null}
              {interaction.status === "pending" ? (
                <div className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/5 p-3">
                  <p className="text-xs font-medium text-sky-800 dark:text-sky-200">
                    Waiting on operator input. Answer submission is not available in this UI yet.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Review the requested choices below. The supported action is to cancel this pending question.
                  </p>
                  <div className="mt-3 grid gap-2" aria-label="Requested answer choices">
                    {question.options.map((option) => (
                      <div
                        key={option.id}
                        className="rounded-md border border-border/70 bg-background px-3 py-2 text-left text-sm"
                      >
                        <span className="font-medium">{option.label}</span>
                        {option.description ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {labels.length > 0 ? (
                    labels.map((label) => (
                      <span key={label} className="rounded-md border border-border/70 px-2 py-0.5 text-xs text-foreground">
                        Answer: {label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No answer recorded.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {interaction.status === "cancelled" ? (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          {interaction.result?.cancellationReason || "Question cancelled without a reason."}
        </div>
      ) : null}
      {interaction.status === "expired" ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          This workflow question expired before it was answered.
        </div>
      ) : null}
      {interaction.status === "failed" ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          This workflow question could not be resolved. Ask the agent to create a new question if it is still needed.
        </div>
      ) : null}
      {interaction.result?.summaryMarkdown ? (
        <div className="mt-3 rounded-md border border-border/70 bg-background/75 px-3 py-2 text-sm">
          {interaction.result.summaryMarkdown}
        </div>
      ) : null}

      {interaction.status === "pending" && onCancelInteraction ? (
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={cancelling}
            onClick={() => void onCancelInteraction(interaction)}
          >
            {cancelling ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Cancelling...
              </>
            ) : (
              "Cancel question"
            )}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
