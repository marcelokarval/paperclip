// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { IssueThreadInteraction } from "@paperclipai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  overrides: Partial<IssueThreadInteraction> = {},
): IssueThreadInteraction {
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
  it("renders pending questions read-only with only cancellation affordance", () => {
    const onCancelInteraction = vi.fn();
    const host = renderCard({ onCancelInteraction });

    expect(host.textContent).toContain("Agent questions / Pending");
    expect(host.textContent).toContain("Clarify launch scope");
    expect(host.textContent).toContain("Wakes assignee");
    expect(host.textContent).toContain("Answer submission is not available in this UI yet");
    expect(host.textContent).toContain("The supported action is to cancel this pending question");
    expect(host.textContent).toContain("Phase 1");
    expect(host.textContent).toContain("Full launch");
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(host.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.textContent).toContain("Cancel question");

    const button = Array.from(host.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Cancel question"),
    );
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCancelInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "interaction-1" }),
    );
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
    expect(expired.textContent).toContain("expired before it was answered");

    act(() => root.unmount());
    expired.remove();

    const failed = renderCard({ interaction: interaction({ status: "failed" }) });
    expect(failed.textContent).toContain("Agent questions / Failed");
    expect(failed.textContent).toContain("could not be resolved");
  });
});
