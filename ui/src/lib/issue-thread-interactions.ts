export type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInteraction,
  AskUserQuestionsPayload,
  AskUserQuestionsQuestion,
  AskUserQuestionsQuestionOption,
  AskUserQuestionsResult,
  IssueThreadInteraction,
} from "@paperclipai/shared";
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsQuestion,
  IssueThreadInteraction,
} from "@paperclipai/shared";

export function issueThreadInteractionStatusLabel(
  status: IssueThreadInteraction["status"],
) {
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

export function buildIssueThreadInteractionSummary(
  interaction: IssueThreadInteraction,
) {
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
