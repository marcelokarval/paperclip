import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInteraction,
  AskUserQuestionsPayload,
  AskUserQuestionsQuestion,
  AskUserQuestionsQuestionOption,
  AskUserQuestionsResult,
  IssueThreadInteraction,
  RequestConfirmationInteraction,
  RequestConfirmationPayload,
  RequestConfirmationResult,
  SuggestTasksInteraction,
  SuggestTasksPayload,
  SuggestTasksResult,
  SuggestedTaskDraft,
} from "@paperclipai/shared";

export type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInteraction,
  AskUserQuestionsPayload,
  AskUserQuestionsQuestion,
  AskUserQuestionsQuestionOption,
  AskUserQuestionsResult,
  IssueThreadInteraction,
  RequestConfirmationInteraction,
  RequestConfirmationPayload,
  RequestConfirmationResult,
  SuggestTasksInteraction,
  SuggestTasksPayload,
  SuggestTasksResult,
  SuggestedTaskDraft,
};

export interface SuggestedTaskTreeNode {
  task: SuggestedTaskDraft;
  children: SuggestedTaskTreeNode[];
}

export function issueThreadInteractionStatusLabel(
  status: IssueThreadInteraction["status"],
) {
  switch (status) {
    case "pending":
      return "Pending";
    case "answered":
      return "Answered";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
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

export function buildIssueThreadInteractionSummary(
  interaction: IssueThreadInteraction,
) {
  if (interaction.kind === "suggest_tasks") {
    const count = interaction.payload.tasks.length;
    if (interaction.status === "accepted") {
      const createdCount = interaction.result?.createdTasks?.length ?? 0;
      const skippedCount = interaction.result?.skippedClientKeys?.length ?? 0;
      if (skippedCount > 0) return `Accepted ${createdCount} of ${count} tasks`;
      return createdCount === 1 ? "Accepted 1 task" : `Accepted ${createdCount} tasks`;
    }
    if (interaction.status === "rejected") {
      return count === 1 ? "Rejected 1 task" : `Rejected ${count} tasks`;
    }
    return count === 1 ? "Suggested 1 task" : `Suggested ${count} tasks`;
  }

  if (interaction.kind === "request_confirmation") {
    if (interaction.status === "accepted") return "Confirmed request";
    if (interaction.status === "rejected") return "Declined request";
    if (interaction.status === "expired") return "Confirmation expired";
    if (interaction.status === "failed") return "Confirmation failed";
    return "Requested confirmation";
  }

  const count = interaction.payload.questions.length;
  if (interaction.status === "answered") {
    return count === 1 ? "Answered 1 question" : `Answered ${count} questions`;
  }
  if (interaction.status === "cancelled") {
    return count === 1 ? "Cancelled 1 question" : `Cancelled ${count} questions`;
  }
  if (interaction.status === "expired") {
    return count === 1 ? "Expired 1 question" : `Expired ${count} questions`;
  }
  if (interaction.status === "failed") {
    return count === 1 ? "Failed 1 question" : `Failed ${count} questions`;
  }
  return count === 1 ? "Asked 1 question" : `Asked ${count} questions`;
}

export function issueThreadInteractionKindLabel(kind: IssueThreadInteraction["kind"]) {
  switch (kind) {
    case "ask_user_questions":
      return "Agent questions";
    case "suggest_tasks":
      return "Suggested tasks";
    case "request_confirmation":
      return "Confirmation";
    default:
      return kind;
  }
}

export function buildSuggestedTaskTree(
  tasks: readonly SuggestedTaskDraft[],
): SuggestedTaskTreeNode[] {
  const nodes = new Map<string, SuggestedTaskTreeNode>();
  for (const task of tasks) {
    nodes.set(task.clientKey, { task, children: [] });
  }

  const roots: SuggestedTaskTreeNode[] = [];
  for (const task of tasks) {
    const node = nodes.get(task.clientKey);
    if (!node) continue;
    const parent = task.parentClientKey ? nodes.get(task.parentClientKey) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function collectSuggestedTaskClientKeys(node: SuggestedTaskTreeNode): string[] {
  return [
    node.task.clientKey,
    ...node.children.flatMap((child) => collectSuggestedTaskClientKeys(child)),
  ];
}

export function getQuestionAnswerLabels(args: {
  question: AskUserQuestionsQuestion;
  answers: readonly AskUserQuestionsAnswer[];
}) {
  const { question, answers } = args;
  const selectedIds =
    answers.find((answer) => answer.questionId === question.id)?.optionIds ?? [];
  const optionLabelById = new Map(
    question.options.map((option) => [option.id, option.label] as const),
  );
  return selectedIds
    .map((optionId) => optionLabelById.get(optionId))
    .filter((label): label is string => typeof label === "string");
}
