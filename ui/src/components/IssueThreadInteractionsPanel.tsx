import { Loader2 } from "lucide-react";
import type { IssueThreadInteraction } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";

function issueThreadInteractionStatusLabel(status: IssueThreadInteraction["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "answered":
      return "Answered";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function IssueThreadInteractionsPanel({
  interactions,
  cancellingInteractionId,
  onCancel,
}: {
  interactions: IssueThreadInteraction[];
  cancellingInteractionId: string | null;
  onCancel: (interactionId: string) => void;
}) {
  if (interactions.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Agent questions</div>
          <div className="text-xs text-muted-foreground">
            Resolve or cancel pending workflow questions without affecting queued comments.
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {interactions.map((interaction) => {
          const questionCount = interaction.payload.questions.length;
          const isPending = interaction.status === "pending";
          const cancelling = cancellingInteractionId === interaction.id;
          return (
            <div
              key={interaction.id}
              className="rounded-md border border-border/70 bg-background/80 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm border border-border/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {issueThreadInteractionStatusLabel(interaction.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {questionCount === 1 ? "1 question" : `${questionCount} questions`}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {interaction.title ?? interaction.payload.title ?? "Questions for the operator"}
                  </div>
                  {interaction.summary ? (
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">{interaction.summary}</p>
                  ) : null}
                  {interaction.status === "cancelled" ? (
                    <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
                      {interaction.result?.cancellationReason || "Question cancelled without a reason."}
                    </p>
                  ) : null}
                </div>
                {isPending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancellingInteractionId !== null}
                    onClick={() => onCancel(interaction.id)}
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
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
