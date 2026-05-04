// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ActivityEvent, IssueThreadInteraction } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunForIssue } from "../api/activity";
import { IssueRunLedgerContent } from "./IssueRunLedger";

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & ComponentProps<"a">) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-04T13:00:00.000Z"));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function renderLedger(props: Partial<ComponentProps<typeof IssueRunLedgerContent>> = {}) {
  act(() => {
    root.render(
      <IssueRunLedgerContent
        runs={props.runs ?? []}
        interactions={props.interactions}
        activityEvents={props.activityEvents}
        agentMap={props.agentMap ?? new Map([["agent-1", { name: "CodexCoder" }]])}
        renderActivityEvent={props.renderActivityEvent}
        cancellingInteractionId={props.cancellingInteractionId}
        onCancelInteraction={props.onCancelInteraction}
      />,
    );
  });
}

function run(overrides: Partial<RunForIssue> = {}): RunForIssue {
  return {
    runId: "run-00000000",
    status: "succeeded",
    agentId: "agent-1",
    adapterType: "codex_local",
    startedAt: "2026-05-04T12:40:00.000Z",
    finishedAt: "2026-05-04T12:45:00.000Z",
    createdAt: "2026-05-04T12:40:00.000Z",
    invocationSource: "assignment",
    usageJson: null,
    resultJson: null,
    ...overrides,
  };
}

function activity(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "activity-1",
    companyId: "company-1",
    actorType: "system",
    actorId: "system",
    action: "issue.updated",
    entityType: "issue",
    entityId: "issue-1",
    agentId: null,
    runId: null,
    details: null,
    createdAt: new Date("2026-05-04T12:35:00.000Z"),
    ...overrides,
  };
}

function interaction(overrides: Partial<IssueThreadInteraction> = {}): IssueThreadInteraction {
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
        options: [{ id: "phase-1", label: "Phase 1" }],
      }],
    },
    result: null,
    createdAt: "2026-05-04T12:50:00.000Z",
    updatedAt: "2026-05-04T12:50:00.000Z",
    ...overrides,
  };
}

describe("IssueRunLedger", () => {
  it("interleaves interactions, runs, and activity by timestamp", () => {
    renderLedger({
      runs: [run()],
      interactions: [interaction()],
      activityEvents: [activity()],
      renderActivityEvent: (event) => (
        <div data-testid={`activity-${event.id}`}>{event.action}</div>
      ),
    });

    const text = container.textContent ?? "";
    const interactionIndex = text.indexOf("Clarify launch scope");
    const runIndex = text.indexOf("run-0000");
    const activityIndex = text.indexOf("issue.updated");

    expect(interactionIndex).toBeGreaterThanOrEqual(0);
    expect(runIndex).toBeGreaterThan(interactionIndex);
    expect(activityIndex).toBeGreaterThan(runIndex);
  });

  it("keeps interaction cancellation distinct from run rows", () => {
    const onCancelInteraction = vi.fn();
    renderLedger({
      runs: [run({ status: "running", finishedAt: null })],
      interactions: [interaction()],
      onCancelInteraction,
    });

    expect(container.textContent).toContain("live");
    expect(container.textContent).toContain("Answer submission is not available in this UI yet");
    expect(container.textContent).toContain("Cancel question");
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(1);

    const cancelButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Cancel question"),
    );
    act(() => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCancelInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "interaction-1" }),
    );
  });
});
