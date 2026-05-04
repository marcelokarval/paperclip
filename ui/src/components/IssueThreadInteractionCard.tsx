import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime, formatShortDate } from "../lib/utils";
import {
  buildIssueThreadInteractionSummary,
  buildSuggestedTaskTree,
  getQuestionAnswerLabels,
  issueThreadInteractionKindLabel,
  issueThreadInteractionStatusLabel,
  type AskUserQuestionsAnswer,
  type AskUserQuestionsInteraction,
  type IssueThreadInteraction,
  type RequestConfirmationInteraction,
  type SuggestTasksInteraction,
  type SuggestedTaskTreeNode,
} from "../lib/issue-thread-interactions";

interface IssueThreadInteractionCardProps {
  interaction: IssueThreadInteraction;
  cancelling?: boolean;
  onCancelInteraction?: (interaction: IssueThreadInteraction) => Promise<void> | void;
  onSubmitInteractionAnswers?: (
    interaction: AskUserQuestionsInteraction,
    answers: AskUserQuestionsAnswer[],
  ) => Promise<void> | void;
  onAcceptInteraction?: (
    interaction: RequestConfirmationInteraction,
  ) => Promise<void> | void;
  onRejectInteraction?: (
    interaction: SuggestTasksInteraction | RequestConfirmationInteraction,
    reason?: string,
  ) => Promise<void> | void;
}

function statusIcon(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "answered":
    case "accepted":
      return CheckCircle2;
    case "cancelled":
    case "rejected":
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
    case "accepted":
      return {
        shell: "border-emerald-500/40 bg-emerald-500/5",
        badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "cancelled":
    case "rejected":
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

function questionHelpText(question: AskUserQuestionsInteraction["payload"]["questions"][number]) {
  return "helpText" in question && typeof question.helpText === "string"
    ? question.helpText
    : question.description ?? null;
}

function QuestionOptionButton({
  label,
  description,
  selected,
  selectionMode,
  onClick,
}: {
  label: string;
  description?: string | null;
  selected: boolean;
  selectionMode: "single" | "multi";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={selectionMode === "single" ? "radio" : "checkbox"}
      aria-checked={selected}
      className={cn(
        "rounded-md border px-3 py-2 text-left text-sm transition-colors",
        selected
          ? "border-sky-500/70 bg-sky-500/10 text-sky-950 dark:text-sky-50"
          : "border-border/70 bg-background hover:border-sky-500/60 hover:bg-sky-500/5",
      )}
      onClick={onClick}
    >
      <span className="font-medium">{label}</span>
      {description ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      ) : null}
    </button>
  );
}

function AskUserQuestionsCard({
  interaction,
  onSubmitInteractionAnswers,
}: {
  interaction: AskUserQuestionsInteraction;
  onSubmitInteractionAnswers?: IssueThreadInteractionCardProps["onSubmitInteractionAnswers"];
}) {
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string[]>>({});
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const questions = interaction.payload.questions;

  useEffect(() => {
    setDraftAnswers(Object.fromEntries(
      (interaction.result?.answers ?? []).map((answer) => [answer.questionId, [...answer.optionIds]]),
    ));
    setActionError(null);
    if (interaction.status !== "pending") setWorking(false);
  }, [interaction.id, interaction.result?.answers, interaction.status]);

  const canSubmit = questions
    .filter((question) => question.required)
    .every((question) => (draftAnswers[question.id] ?? []).length > 0);

  function toggleOption(questionId: string, optionId: string, selectionMode: "single" | "multi") {
    setActionError(null);
    setDraftAnswers((current) => {
      const existing = current[questionId] ?? [];
      if (selectionMode === "single") return { ...current, [questionId]: [optionId] };
      const next = existing.includes(optionId)
        ? existing.filter((value) => value !== optionId)
        : [...existing, optionId];
      return { ...current, [questionId]: next };
    });
  }

  async function handleSubmit() {
    if (!onSubmitInteractionAnswers || !canSubmit || working) return;
    setWorking(true);
    setActionError(null);
    try {
      await onSubmitInteractionAnswers(
        interaction,
        questions.map((question) => ({
          questionId: question.id,
          optionIds: draftAnswers[question.id] ?? [],
        })),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to submit answers.");
    } finally {
      setWorking(false);
    }
  }

  if (interaction.status !== "pending") {
    return (
      <div className="mt-4 space-y-3">
        {questions.map((question) => {
          const labels = getQuestionAnswerLabels({
            question,
            answers: interaction.result?.answers ?? [],
          });
          return (
            <div key={question.id} className="rounded-md border border-border/70 bg-background/75 p-3">
              <div className="text-sm font-medium text-foreground">{question.prompt}</div>
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
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {questions.map((question) => (
        <div key={question.id} className="rounded-md border border-border/70 bg-background/75 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-foreground">{question.prompt}</div>
              {questionHelpText(question) ? (
                <p className="mt-1 text-xs text-muted-foreground">{questionHelpText(question)}</p>
              ) : null}
            </div>
            <span className="rounded-md border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
              {question.selectionMode === "single" ? "Pick one" : "Pick many"}
              {question.required ? " / required" : " / optional"}
            </span>
          </div>
          <div
            className="mt-3 grid gap-2"
            role={question.selectionMode === "single" ? "radiogroup" : "group"}
            aria-label={question.prompt}
          >
            {question.options.map((option) => (
              <QuestionOptionButton
                key={option.id}
                label={option.label}
                description={option.description}
                selected={(draftAnswers[question.id] ?? []).includes(option.id)}
                selectionMode={question.selectionMode}
                onClick={() => toggleOption(question.id, option.id, question.selectionMode)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-background/75 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Submit once after all required questions are answered.
        </span>
        <Button
          size="sm"
          disabled={!onSubmitInteractionAnswers || !canSubmit || working}
          onClick={() => void handleSubmit()}
        >
          {working ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Submitting...
            </>
          ) : (
            interaction.payload.submitLabel ?? "Submit answers"
          )}
        </Button>
      </div>
      {actionError ? (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}
    </div>
  );
}

function TaskNode({
  node,
  depth = 0,
}: {
  node: SuggestedTaskTreeNode;
  depth?: number;
}) {
  return (
    <>
      <div className="rounded-md border border-border/70 bg-background/75 p-3" style={depth ? { marginLeft: depth * 18 } : undefined}>
        <div className="flex items-start gap-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{node.task.title}</span>
            {node.task.description ? (
              <span className="mt-1 block text-xs text-muted-foreground">{node.task.description}</span>
            ) : null}
          </span>
        </div>
      </div>
      {node.children.map((child) => (
        <TaskNode
          key={child.task.clientKey}
          node={child}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

function SuggestTasksCard({
  interaction,
  onRejectInteraction,
}: {
  interaction: SuggestTasksInteraction;
  onRejectInteraction?: IssueThreadInteractionCardProps["onRejectInteraction"];
}) {
  const roots = useMemo(() => buildSuggestedTaskTree(interaction.payload.tasks), [interaction.payload.tasks]);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState(interaction.result?.rejectionReason ?? "");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setRejectReason(interaction.result?.rejectionReason ?? "");
    setActionError(null);
    if (interaction.status !== "pending") setWorking(false);
  }, [interaction.id, interaction.payload.tasks, interaction.result?.rejectionReason, interaction.status]);

  async function handleReject() {
    if (!onRejectInteraction || working) return;
    setWorking(true);
    setActionError(null);
    try {
      await onRejectInteraction(interaction, rejectReason.trim() || undefined);
      setRejecting(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to reject suggested tasks.");
    } finally {
      setWorking(false);
    }
  }

  const createdCount = interaction.result?.createdTasks?.length ?? 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="text-xs text-muted-foreground">
        {interaction.payload.tasks.length} draft {interaction.payload.tasks.length === 1 ? "task" : "tasks"}
      </div>
      {roots.map((node) => (
        <TaskNode key={node.task.clientKey} node={node} />
      ))}
      {interaction.status === "accepted" ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          Created {createdCount} {createdCount === 1 ? "task" : "tasks"}.
        </div>
      ) : null}
      {interaction.status === "rejected" ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          {interaction.result?.rejectionReason || "Suggested tasks were rejected without a reason."}
        </div>
      ) : null}
      {interaction.status === "pending" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={!onRejectInteraction || working} onClick={() => setRejecting((value) => !value)}>
              Reject
            </Button>
          </div>
          {rejecting ? (
            <div className="space-y-2">
              <Textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Optional rejection reason"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={!onRejectInteraction || working} onClick={() => void handleReject()}>
                  {working ? "Saving..." : "Save rejection"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}
    </div>
  );
}

function RequestConfirmationCard({
  interaction,
  onAcceptInteraction,
  onRejectInteraction,
}: {
  interaction: RequestConfirmationInteraction;
  onAcceptInteraction?: IssueThreadInteractionCardProps["onAcceptInteraction"];
  onRejectInteraction?: IssueThreadInteractionCardProps["onRejectInteraction"];
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState(interaction.result?.reason ?? "");
  const [working, setWorking] = useState<"accept" | "reject" | null>(null);
  const [attemptedReject, setAttemptedReject] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const rejectRequiresReason = interaction.payload.rejectRequiresReason === true;
  const allowDeclineReason = interaction.payload.allowDeclineReason !== false;
  const canReject = !rejectRequiresReason || rejectReason.trim().length > 0;

  useEffect(() => {
    setRejectReason(interaction.result?.reason ?? "");
    setAttemptedReject(false);
    setActionError(null);
    if (interaction.status !== "pending") setWorking(null);
  }, [interaction.id, interaction.result?.reason, interaction.status]);

  async function handleAccept() {
    if (!onAcceptInteraction || working) return;
    setWorking("accept");
    setActionError(null);
    try {
      await onAcceptInteraction(interaction);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to confirm request.");
    } finally {
      setWorking(null);
    }
  }

  async function handleReject() {
    setAttemptedReject(true);
    if (!onRejectInteraction || !canReject || working) return;
    setWorking("reject");
    setActionError(null);
    try {
      await onRejectInteraction(interaction, rejectReason.trim() || undefined);
      setRejecting(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to decline request.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-md border border-border/70 bg-background/75 p-3 text-sm text-foreground">
        {interaction.payload.prompt}
        {interaction.payload.detailsMarkdown ? (
          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{interaction.payload.detailsMarkdown}</p>
        ) : null}
      </div>
      {interaction.status === "accepted" ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          Confirmed.
        </div>
      ) : null}
      {interaction.status === "rejected" ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          {interaction.result?.reason || "Declined without a reason."}
        </div>
      ) : null}
      {interaction.status === "pending" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" disabled={!onAcceptInteraction || working !== null} onClick={() => void handleAccept()}>
              {working === "accept" ? "Confirming..." : interaction.payload.acceptLabel ?? "Confirm"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!onRejectInteraction || working !== null}
              onClick={() => {
                if (!allowDeclineReason) void handleReject();
                else setRejecting((value) => !value);
              }}
            >
              {interaction.payload.rejectLabel ?? "Decline"}
            </Button>
          </div>
          {rejecting ? (
            <div className="space-y-2">
              <Textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder={interaction.payload.declineReasonPlaceholder ?? "Optional decline reason"}
                aria-invalid={attemptedReject && !canReject}
              />
              {attemptedReject && !canReject ? (
                <p className="text-xs text-destructive">A decline reason is required.</p>
              ) : null}
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={!onRejectInteraction || working !== null} onClick={() => void handleReject()}>
                  {working === "reject" ? "Saving..." : interaction.payload.rejectLabel ?? "Decline"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}
    </div>
  );
}

export function IssueThreadInteractionCard({
  interaction,
  cancelling = false,
  onCancelInteraction,
  onSubmitInteractionAnswers,
  onAcceptInteraction,
  onRejectInteraction,
}: IssueThreadInteractionCardProps) {
  const StatusIcon = statusIcon(interaction.status);
  const styles = statusClasses(interaction.status);
  const canCancel = interaction.status === "pending" && interaction.kind === "ask_user_questions" && onCancelInteraction;

  return (
    <article className={cn("rounded-lg border p-4", styles.shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em]", styles.badge)}>
              <StatusIcon className="h-3.5 w-3.5" />
              {issueThreadInteractionKindLabel(interaction.kind)} / {issueThreadInteractionStatusLabel(interaction.status)}
            </span>
            {interaction.continuationPolicy === "wake_assignee" || interaction.continuationPolicy === "wake_assignee_on_accept" ? (
              <span className="rounded-md border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                {interaction.continuationPolicy === "wake_assignee_on_accept" ? "Wakes on accept" : "Wakes assignee"}
              </span>
            ) : null}
          </div>
          <h4 className="mt-2 text-sm font-semibold text-foreground">
            {interaction.title
              ?? (interaction.kind === "ask_user_questions"
                ? interaction.payload.title ?? "Questions for the operator"
                : interaction.kind === "suggest_tasks"
                  ? "Suggested task tree"
                  : "Confirmation requested")}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {interaction.summary ?? buildIssueThreadInteractionSummary(interaction)}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground" title={formatDateTime(interaction.createdAt)}>
          {formatShortDate(interaction.createdAt)}
        </div>
      </div>

      {interaction.kind === "ask_user_questions" ? (
        <AskUserQuestionsCard
          interaction={interaction}
          onSubmitInteractionAnswers={onSubmitInteractionAnswers}
        />
      ) : interaction.kind === "suggest_tasks" ? (
        <SuggestTasksCard
          interaction={interaction}
          onRejectInteraction={onRejectInteraction}
        />
      ) : (
        <RequestConfirmationCard
          interaction={interaction}
          onAcceptInteraction={onAcceptInteraction}
          onRejectInteraction={onRejectInteraction}
        />
      )}

      {interaction.status === "cancelled" && interaction.kind === "ask_user_questions" ? (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          {interaction.result?.cancellationReason || "Question cancelled without a reason."}
        </div>
      ) : null}
      {interaction.status === "expired" ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          This workflow interaction expired before it was resolved.
        </div>
      ) : null}
      {interaction.status === "failed" ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          This workflow interaction could not be resolved. Ask the agent to create a new request if it is still needed.
        </div>
      ) : null}
      {"result" in interaction && interaction.result && "summaryMarkdown" in interaction.result && interaction.result.summaryMarkdown ? (
        <div className="mt-3 rounded-md border border-border/70 bg-background/75 px-3 py-2 text-sm">
          {interaction.result.summaryMarkdown}
        </div>
      ) : null}

      {canCancel ? (
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
