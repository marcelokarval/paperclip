// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalPayloadRenderer, approvalLabel } from "./ApprovalPayload";
import { ApprovalCard } from "./ApprovalCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("approvalLabel", () => {
  it("uses payload titles for generic board approvals", () => {
    expect(
      approvalLabel("request_board_approval", {
        title: "Reply with an ASCII frog",
      }),
    ).toBe("Board Approval: Reply with an ASCII frog");
  });
});

describe("ApprovalPayloadRenderer", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders request_board_approval payload fields without falling back to raw JSON", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          payload={{
            title: "Reply with an ASCII frog",
            summary: "Board asked for approval before posting the frog.",
            recommendedAction: "Approve the frog reply.",
            nextActionOnApproval: "Post the frog comment on the issue.",
            risks: ["The frog might be too powerful."],
            proposedComment: "(o)<",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Reply with an ASCII frog");
    expect(container.textContent).toContain("Board asked for approval before posting the frog.");
    expect(container.textContent).toContain("Approve the frog reply.");
    expect(container.textContent).toContain("Post the frog comment on the issue.");
    expect(container.textContent).toContain("The frog might be too powerful.");
    expect(container.textContent).toContain("(o)<");
    expect(container.textContent).not.toContain("\"recommendedAction\"");

    act(() => {
      root.unmount();
    });
  });

  it("can hide the repeated title when the card header already shows it", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          hidePrimaryTitle
          payload={{
            title: "Reply with an ASCII frog",
            summary: "Board asked for approval before posting the frog.",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Board asked for approval before posting the frog.");
    expect(container.textContent).not.toContain("TitleReply with an ASCII frog");

    act(() => {
      root.unmount();
    });
  });

  it("renders hire model, reasoning, and operating model evidence", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="hire_agent"
          payload={{
            name: "CTO",
            role: "cto",
            adapterType: "codex_local",
            adapterConfig: {
              model: "gpt-5.5",
              modelReasoningEffort: "high",
            },
            operatingModel: {
              selectedModel: "gpt-5.5",
              reasoningEffort: "high",
              selectedModelDiscovered: true,
              operatingModelsGeneratedAt: "2026-05-02T00:00:00.000Z",
              operatingModelsStale: false,
            },
          }}
        />,
      );
    });

    expect(container.textContent).toContain("gpt-5.5");
    expect(container.textContent).toContain("high");
    expect(container.textContent).toContain("Operating model snapshot");
    expect(container.textContent).toContain("Model discovered: yes");
    expect(container.textContent).toContain("OPERATING_MODELS.md: fresh");

    act(() => {
      root.unmount();
    });
  });
});

describe("ApprovalCard", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("marks issue HITL board approvals explicitly", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalCard
          requesterAgent={null}
          approval={{
            id: "approval-1",
            companyId: "company-1",
            type: "request_board_approval",
            requestedByAgentId: null,
            requestedByUserId: null,
            status: "pending",
            payload: {
              source: "issue_hitl_request",
              title: "Review HITL request",
              summary: "Needs operator approval.",
            },
            decisionNote: null,
            decidedByUserId: null,
            decidedAt: null,
            createdAt: new Date("2026-05-02T00:00:00.000Z"),
            updatedAt: new Date("2026-05-02T00:00:00.000Z"),
          }}
        />,
      );
    });

    expect(container.textContent).toContain("HITL");
    expect(container.textContent).toContain("Review HITL request");

    act(() => {
      root.unmount();
    });
  });
});
