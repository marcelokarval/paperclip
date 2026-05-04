// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskUserQuestionsInteraction, IssueThreadInteraction } from "../lib/issue-thread-interactions";
import { IssueThreadInteractionCard } from "./IssueThreadInteractionCard";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & ComponentProps<"a">) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

function interaction(
  overrides: Partial<AskUserQuestionsInteraction> = {},
): AskUserQuestionsInteraction {
  return {
    id: "interaction-1",
    companyId: "company-1",
    issueId: "issue-1",
    kind: "ask_user_questions",
    status: "pending",
    continuationPolicy: "wake_assignee",
    title: "Clarify launch scope",
    summary: "The agent needs a board decision before continuing.",
    payload: {
      version: 1,
      questions: [
        {
          id: "scope",
          prompt: "Which launch scope?",
          selectionMode: "single",
          required: true,
          options: [
            { id: "phase-1", label: "Phase 1" },
            { id: "full", label: "Full launch" },
          ],
        },
        {
          id: "channels",
          prompt: "Which channels?",
          selectionMode: "multi",
          options: [
            { id: "email", label: "Email" },
            { id: "social", label: "Social" },
          ],
        },
      ],
    },
    result: null,
    createdAt: "2026-05-04T12:00:00.000Z",
    updatedAt: "2026-05-04T12:00:00.000Z",
    ...overrides,
  };
}

function renderCard(props: Partial<ComponentProps<typeof IssueThreadInteractionCard>> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <IssueThreadInteractionCard
        interaction={interaction()}
        {...props}
      />,
    );
  });
  return container;
}

describe("IssueThreadInteractionCard", () => {
  it("submits pending question answers and keeps cancellation as fallback", async () => {
    const onCancelInteraction = vi.fn();
    const onSubmitInteractionAnswers = vi.fn().mockResolvedValue(undefined);
    const host = renderCard({ onCancelInteraction, onSubmitInteractionAnswers });

    expect(host.textContent).toContain("Agent questions / Pending");
    expect(host.textContent).toContain("Clarify launch scope");
    expect(host.textContent).toContain("Wakes assignee");
    expect(host.textContent).toContain("Phase 1");
    expect(host.textContent).toContain("Full launch");
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(host.querySelectorAll('[role="checkbox"]')).toHaveLength(2);
    expect(host.textContent).toContain("Cancel question");

    const submitButton = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Submit answers"),
    );
    expect((submitButton as HTMLButtonElement | undefined)?.disabled).toBe(true);

    await act(async () => {
      host.querySelector('[role="radio"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      host.querySelector('[role="checkbox"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect((submitButton as HTMLButtonElement | undefined)?.disabled).toBe(false);

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmitInteractionAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ id: "interaction-1" }),
      [
        { questionId: "scope", optionIds: ["phase-1"] },
        { questionId: "channels", optionIds: ["email"] },
      ],
    );

    const button = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Cancel question"),
    );
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCancelInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "interaction-1" }),
    );
  });

  it("does not duplicate answer submission while a request is pending", async () => {
    let resolveSubmit: (() => void) | null = null;
    const onSubmitInteractionAnswers = vi.fn(() =>
      new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const host = renderCard({ onSubmitInteractionAnswers });

    await act(async () => {
      host.querySelector('[role="radio"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const submitButton = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Submit answers"),
    );

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmitInteractionAnswers).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Submitting...");

    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmitInteractionAnswers).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit?.();
    });
  });

  it("surfaces answer submission failures inline", async () => {
    const onSubmitInteractionAnswers = vi.fn().mockRejectedValue(new Error("Backend route missing"));
    const host = renderCard({ onSubmitInteractionAnswers });

    await act(async () => {
      host.querySelector('[role="radio"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const submitButton = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Submit answers"),
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Backend route missing");
  });

  it("renders terminal statuses explicitly", () => {
    const answered = renderCard({
      interaction: interaction({
        status: "answered",
        result: {
          version: 1,
          answers: [
            { questionId: "scope", optionIds: ["phase-1"] },
            { questionId: "channels", optionIds: ["email", "social"] },
          ],
          summaryMarkdown: "Board chose the smaller launch.",
        },
      }),
    });
    expect(answered.textContent).toContain("Agent questions / Answered");
    expect(answered.textContent).toContain("Answer: Phase 1");
    expect(answered.textContent).toContain("Answer: Email");
    expect(answered.textContent).toContain("Board chose the smaller launch.");

    act(() => root.unmount());
    answered.remove();

    const cancelled = renderCard({
      interaction: interaction({
        status: "cancelled",
        result: {
          version: 1,
          answers: [],
          cancelled: true,
          cancellationReason: "No longer needed.",
        },
      }),
    });
    expect(cancelled.textContent).toContain("Agent questions / Cancelled");
    expect(cancelled.textContent).toContain("No longer needed.");

    act(() => root.unmount());
    cancelled.remove();

    const expired = renderCard({ interaction: interaction({ status: "expired" }) });
    expect(expired.textContent).toContain("Agent questions / Expired");
    expect(expired.textContent).toContain("expired before it was resolved");

    act(() => root.unmount());
    expired.remove();

    const failed = renderCard({ interaction: interaction({ status: "failed" }) });
    expect(failed.textContent).toContain("Agent questions / Failed");
    expect(failed.textContent).toContain("workflow interaction could not be resolved");
  });

  it("renders suggested task cards without unsupported accept controls", async () => {
    const onAcceptInteraction = vi.fn().mockResolvedValue(undefined);
    const onRejectInteraction = vi.fn().mockResolvedValue(undefined);
    const suggest = renderCard({
      interaction: {
        id: "suggest-1",
        companyId: "company-1",
        issueId: "issue-1",
        kind: "suggest_tasks",
        status: "pending",
        continuationPolicy: "wake_assignee_on_accept",
        title: "Review generated tasks",
        payload: {
          version: 1,
          tasks: [
            { clientKey: "root", title: "Build flow" },
            { clientKey: "child", parentClientKey: "root", title: "Add tests" },
          ],
        },
        result: null,
        createdAt: "2026-05-04T12:00:00.000Z",
        updatedAt: "2026-05-04T12:00:00.000Z",
      },
      onAcceptInteraction,
      onRejectInteraction,
    });

    expect(suggest.textContent).toContain("Suggested tasks / Pending");
    expect(suggest.textContent).toContain("Wakes on accept");
    expect(suggest.textContent).toContain("Build flow");
    expect(suggest.textContent).not.toContain("Accept selected tasks");
    expect(suggest.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    await act(async () => {
      Array.from(suggest.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Reject"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      Array.from(suggest.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Save rejection"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAcceptInteraction).not.toHaveBeenCalled();
    expect(onRejectInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "suggest-1" }),
      undefined,
    );

    act(() => root.unmount());
    suggest.remove();
  });

  it("renders confirmation review cards with supported accept", async () => {
    const onAcceptInteraction = vi.fn().mockResolvedValue(undefined);
    const onRejectInteraction = vi.fn().mockResolvedValue(undefined);

    const confirmation = renderCard({
      interaction: {
        id: "confirm-1",
        companyId: "company-1",
        issueId: "issue-1",
        kind: "request_confirmation",
        status: "pending",
        continuationPolicy: "wake_assignee_on_accept",
        title: "Approve plan",
        payload: {
          version: 1,
          prompt: "Approve the proposed plan?",
          acceptLabel: "Approve plan",
          rejectLabel: "Request changes",
          rejectRequiresReason: true,
        },
        result: null,
        createdAt: "2026-05-04T12:00:00.000Z",
        updatedAt: "2026-05-04T12:00:00.000Z",
      },
      onAcceptInteraction,
      onRejectInteraction,
    });

    expect(confirmation.textContent).toContain("Confirmation / Pending");
    expect(confirmation.textContent).toContain("Approve the proposed plan?");
    await act(async () => {
      Array.from(confirmation.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Approve plan"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAcceptInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "confirm-1" }),
    );
  });

  it("re-enables cancellation after the parent pending state clears", () => {
    const onCancelInteraction = vi.fn();
    const host = renderCard({ onCancelInteraction, cancelling: true });
    const cancellingButton = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Cancelling..."),
    ) as HTMLButtonElement | undefined;
    expect(cancellingButton?.disabled).toBe(true);

    act(() => {
      root.render(
        <IssueThreadInteractionCard
          interaction={interaction()}
          onCancelInteraction={onCancelInteraction}
          cancelling={false}
        />,
      );
    });

    const cancelButton = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Cancel question"),
    ) as HTMLButtonElement | undefined;
    expect(cancelButton?.disabled).toBe(false);
  });
});
