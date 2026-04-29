// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepositoryDocumentationBaseline } from "@paperclipai/shared";
import { RepositoryBaselinePanel } from "./RepositoryBaselinePanel";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    type = "button",
    disabled,
    ...props
  }: ComponentProps<"button">) => (
    <button type={type} disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("../lib/router", () => ({
  Link: ({ children, to, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function buildBaseline(
  overrides: Partial<RepositoryDocumentationBaseline> = {},
): RepositoryDocumentationBaseline {
  return {
    status: "ready",
    source: "scan",
    updatedAt: "2026-04-23T10:06:13.085Z",
    summary: "Repository baseline ready.",
    stack: ["TypeScript"],
    documentationFiles: ["README.md"],
    guardrails: ["Documentation only."],
    gaps: [],
    recommendations: {
      labels: [],
      issuePolicy: {
        parentChildGuidance: [],
        blockingGuidance: [],
        labelUsageGuidance: [],
        reviewGuidance: [],
        approvalGuidance: [],
      },
      projectDefaults: {
        canonicalDocs: [],
        suggestedVerificationCommands: [],
        ownershipAreas: [],
      },
    },
    analysis: null,
    acceptedGuidance: null,
    recommendationDecisions: [],
    trackingIssueId: null,
    trackingIssueIdentifier: null,
    ...overrides,
  };
}

describe("RepositoryBaselinePanel", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders analyzer diagnostics and raw output for non-success results", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <RepositoryBaselinePanel
          baseline={buildBaseline({
            analysis: {
              status: "invalid_output",
              provider: "codex_local",
              command: "codex",
              model: null,
              ranAt: "2026-04-23T10:06:13.085Z",
              durationMs: 45603,
              summary: null,
              risks: [],
              agentGuidance: [],
              error: "Repository baseline analyzer did not return a valid JSON object.",
              changes: {
                appliedChanges: [],
                noOpReason: null,
              },
              rawOutput: "bad\noutput",
            },
          })}
          form={{
            status: "ready",
            summary: "",
            stack: "",
            documentationFiles: "",
            guardrails: "",
          }}
          isRefreshing={false}
          actionMessage={null}
          onRefresh={vi.fn()}
          onRunAnalyzer={vi.fn()}
          onApplyRecommendations={vi.fn()}
          onChange={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("AI analyzer enrichment");
    expect(container.textContent).toContain("Analyzer invalid_output.");
    expect(container.textContent).toContain("Show analyzer diagnostics");
    expect(container.textContent).toContain("Raw output excerpt");
    expect(container.textContent).toContain("bad\noutput");

    act(() => {
      root.unmount();
    });
  });

  it("renders applied changes and omits diagnostics for successful no-raw-output results", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <RepositoryBaselinePanel
          baseline={buildBaseline({
            analysis: {
              status: "succeeded",
              provider: "custom_command",
              command: "/tmp/fake-analyzer",
              model: null,
              ranAt: "2026-04-23T10:06:13.085Z",
              durationMs: 812,
              summary: "Repository enriched.",
              risks: [],
              agentGuidance: [],
              error: null,
              changes: {
                appliedChanges: ["Added suggested labels: docs"],
                noOpReason: null,
              },
              rawOutput: null,
            },
          })}
          form={{
            status: "ready",
            summary: "",
            stack: "",
            documentationFiles: "",
            guardrails: "",
          }}
          isRefreshing={false}
          actionMessage={null}
          onRefresh={vi.fn()}
          onRunAnalyzer={vi.fn()}
          onApplyRecommendations={vi.fn()}
          onChange={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Analyzer applied 1 baseline change.");
    expect(container.textContent).toContain("Applied changes");
    expect(container.textContent).toContain("Added suggested labels: docs");
    expect(container.textContent).not.toContain("Show analyzer diagnostics");
    expect(container.textContent).not.toContain("Raw output excerpt");

    act(() => {
      root.unmount();
    });
  });
});
