// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { IssueThreadInteraction } from "@paperclipai/shared";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IssueThreadInteractionsPanel } from "./IssueThreadInteractionsPanel";

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  host?.remove();
  root = null;
  host = null;
});

function pendingInteraction(): IssueThreadInteraction {
  return {
    id: "interaction-1",
    companyId: "company-1",
    issueId: "issue-1",
    kind: "ask_user_questions",
    status: "pending",
    continuationPolicy: "wake_assignee",
    title: "Clarify launch scope",
    payload: {
      version: 1,
      questions: [{
        id: "scope",
        prompt: "Which scope?",
        selectionMode: "single",
        required: true,
        options: [{ id: "phase-1", label: "Phase 1" }],
      }],
    },
    result: null,
    createdAt: "2026-05-04T12:00:00.000Z",
    updatedAt: "2026-05-04T12:00:00.000Z",
  };
}

function renderPanel(props: {
  interactions: IssueThreadInteraction[];
  cancellingInteractionId?: string | null;
  onCancel?: (interactionId: string) => void;
}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <IssueThreadInteractionsPanel
        interactions={props.interactions}
        cancellingInteractionId={props.cancellingInteractionId ?? null}
        onCancel={props.onCancel ?? vi.fn()}
      />,
    );
  });
  return host;
}

describe("IssueThreadInteractionsPanel", () => {
  it("renders a pending question cancellation affordance", () => {
    const onCancel = vi.fn();
    const rendered = renderPanel({
      interactions: [pendingInteraction()],
      onCancel,
    });

    expect(rendered.textContent).toContain("Agent questions");
    expect(rendered.textContent).toContain("Clarify launch scope");
    expect(rendered.textContent).toContain("Cancel question");

    const button = rendered.querySelector("button");
    expect(button).not.toBeNull();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledWith("interaction-1");
  });

  it("renders cancelled questions without a second cancel button", () => {
    const interaction = {
      ...pendingInteraction(),
      status: "cancelled",
      result: {
        version: 1,
        answers: [],
        cancelled: true,
        cancellationReason: "No longer needed.",
        summaryMarkdown: null,
      },
    } satisfies IssueThreadInteraction;

    const rendered = renderPanel({
      interactions: [interaction],
    });

    expect(rendered.textContent).toContain("Cancelled");
    expect(rendered.textContent).toContain("No longer needed.");
    expect(rendered.textContent).not.toContain("Cancel question");
  });
});
