import { describe, expect, it } from "vitest";
import {
  acceptIssueThreadInteractionSchema,
  askUserQuestionsPayloadSchema,
  createIssueThreadInteractionSchema,
  requestConfirmationPayloadSchema,
  respondIssueThreadInteractionSchema,
  suggestTasksPayloadSchema,
} from "./index.js";

describe("issue thread interaction shared contracts", () => {
  it("accepts the supported create interaction kinds", () => {
    expect(createIssueThreadInteractionSchema.parse({
      kind: "ask_user_questions",
      payload: {
        version: 1,
        questions: [{
          id: "scope",
          prompt: "Choose scope",
          selectionMode: "single",
          required: true,
          options: [{ id: "small", label: "Small" }],
        }],
      },
    })).toMatchObject({
      kind: "ask_user_questions",
      continuationPolicy: "wake_assignee",
    });

    expect(createIssueThreadInteractionSchema.parse({
      kind: "request_confirmation",
      payload: {
        version: 1,
        prompt: "Ship it?",
      },
    })).toMatchObject({
      kind: "request_confirmation",
      continuationPolicy: "none",
    });

    expect(createIssueThreadInteractionSchema.parse({
      kind: "suggest_tasks",
      payload: {
        version: 1,
        tasks: [{ clientKey: "task-1", title: "Follow up" }],
      },
    })).toMatchObject({
      kind: "suggest_tasks",
      continuationPolicy: "wake_assignee",
    });
  });

  it("rejects duplicate question and option ids", () => {
    const parsed = askUserQuestionsPayloadSchema.safeParse({
      version: 1,
      questions: [{
        id: "scope",
        prompt: "Choose scope",
        selectionMode: "multi",
        options: [
          { id: "small", label: "Small" },
          { id: "small", label: "Small again" },
        ],
      }, {
        id: "scope",
        prompt: "Choose another scope",
        selectionMode: "single",
        options: [{ id: "large", label: "Large" }],
      }],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Question ids must be unique within one interaction",
        "Option ids must be unique within one question",
      ]),
    );
  });

  it("validates answer, confirmation, and task payload limits", () => {
    expect(respondIssueThreadInteractionSchema.parse({
      answers: [{ questionId: "scope", optionIds: ["small"] }],
      summaryMarkdown: "Selected the smaller scope.",
    })).toMatchObject({
      answers: [{ questionId: "scope", optionIds: ["small"] }],
    });

    expect(requestConfirmationPayloadSchema.parse({
      version: 1,
      prompt: "Approve the final document?",
      rejectRequiresReason: true,
    })).toMatchObject({ rejectRequiresReason: true });

    expect(suggestTasksPayloadSchema.safeParse({
      version: 1,
      tasks: [
        { clientKey: "task", title: "First" },
        { clientKey: "task", title: "Duplicate" },
      ],
    }).success).toBe(false);
  });

  it("does not expose suggest_tasks acceptance in the accept contract", () => {
    expect(acceptIssueThreadInteractionSchema.parse({})).toEqual({});
    expect(acceptIssueThreadInteractionSchema.safeParse({
      selectedClientKeys: ["task-1"],
    }).success).toBe(false);
  });
});
