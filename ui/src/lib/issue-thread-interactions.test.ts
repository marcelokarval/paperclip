import { describe, expect, it } from "vitest";
import {
  buildIssueThreadInteractionSummary,
  buildSuggestedTaskTree,
  collectSuggestedTaskClientKeys,
  getQuestionAnswerLabels,
  issueThreadInteractionKindLabel,
  issueThreadInteractionStatusLabel,
  type IssueThreadInteraction,
} from "./issue-thread-interactions";

describe("issue-thread-interactions", () => {
  it("labels future interaction statuses and kinds", () => {
    expect(issueThreadInteractionStatusLabel("accepted")).toBe("Accepted");
    expect(issueThreadInteractionStatusLabel("rejected")).toBe("Rejected");
    expect(issueThreadInteractionKindLabel("request_confirmation")).toBe("Confirmation");
    expect(issueThreadInteractionKindLabel("suggest_tasks")).toBe("Suggested tasks");
  });

  it("summarizes ask, suggest, and confirmation interactions", () => {
    const ask: IssueThreadInteraction = {
      id: "ask-1",
      companyId: "company-1",
      issueId: "issue-1",
      kind: "ask_user_questions",
      status: "answered",
      continuationPolicy: "wake_assignee",
      payload: {
        version: 1,
        questions: [{ id: "scope", prompt: "Scope?", selectionMode: "single", options: [{ id: "a", label: "A" }] }],
      },
      result: { version: 1, answers: [{ questionId: "scope", optionIds: ["a"] }] },
      createdAt: "2026-05-04T12:00:00.000Z",
      updatedAt: "2026-05-04T12:00:00.000Z",
    };
    const suggest: IssueThreadInteraction = {
      ...ask,
      id: "suggest-1",
      kind: "suggest_tasks",
      status: "accepted",
      payload: { version: 1, tasks: [{ clientKey: "task-1", title: "Task 1" }] },
      result: { version: 1, createdTasks: [{ clientKey: "task-1", issueId: "issue-2" }] },
    };
    const confirmation: IssueThreadInteraction = {
      ...ask,
      id: "confirm-1",
      kind: "request_confirmation",
      status: "rejected",
      payload: { version: 1, prompt: "Approve?" },
      result: { version: 1, outcome: "rejected", reason: "Needs changes" },
    };

    expect(buildIssueThreadInteractionSummary(ask)).toBe("Answered 1 question");
    expect(buildIssueThreadInteractionSummary(suggest)).toBe("Accepted 1 task");
    expect(buildIssueThreadInteractionSummary(confirmation)).toBe("Declined request");
  });

  it("builds suggested task trees and preserves answer label lookup", () => {
    const tree = buildSuggestedTaskTree([
      { clientKey: "root", title: "Root" },
      { clientKey: "child", parentClientKey: "root", title: "Child" },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.task.title).toBe("Child");
    expect(collectSuggestedTaskClientKeys(tree[0]!)).toEqual(["root", "child"]);
    expect(getQuestionAnswerLabels({
      question: {
        id: "scope",
        prompt: "Scope?",
        selectionMode: "multi",
        options: [{ id: "phase-1", label: "Phase 1" }],
      },
      answers: [{ questionId: "scope", optionIds: ["phase-1", "missing"] }],
    })).toEqual(["Phase 1"]);
  });
});
