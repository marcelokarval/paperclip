// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProviderRateLimitBlock } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderQuotaCard } from "./ProviderQuotaCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function createBlock(overrides: Partial<ProviderRateLimitBlock> = {}): ProviderRateLimitBlock {
  return {
    id: overrides.id ?? "block-1",
    companyId: overrides.companyId ?? "company-1",
    provider: overrides.provider ?? "anthropic",
    adapterType: overrides.adapterType ?? "claude_local",
    limitKind: overrides.limitKind ?? "five_hour",
    modelFamily: overrides.modelFamily ?? null,
    resetsAt: overrides.resetsAt ?? "2026-05-05T18:00:00.000Z",
    sourceRunId: overrides.sourceRunId ?? null,
    sourceIssueId: overrides.sourceIssueId ?? null,
    releasedAt: overrides.releasedAt ?? null,
    releaseReason: overrides.releaseReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-05T17:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-05T17:00:00.000Z",
  };
}

describe("ProviderQuotaCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("renders and releases multiple active provider blocks without spend rows", () => {
    const onReleaseBlock = vi.fn();

    act(() => {
      root.render(
        <ProviderQuotaCard
          provider="anthropic"
          rows={[]}
          budgetMonthlyCents={0}
          totalCompanySpendCents={0}
          weekSpendCents={0}
          windowRows={[]}
          showDeficitNotch={false}
          activeBlocks={[
            createBlock({ id: "block-five-hour", limitKind: "five_hour" }),
            createBlock({ id: "block-opus", limitKind: "opus_weekly", modelFamily: "opus" }),
          ]}
          onReleaseBlock={onReleaseBlock}
        />,
      );
    });

    expect(container.textContent).toContain("Provider hard limit active");
    expect(container.textContent).toContain("five hour");
    expect(container.textContent).toContain("opus weekly for opus");

    const releaseButtons = Array.from(container.querySelectorAll("button"));
    expect(releaseButtons).toHaveLength(2);

    act(() => {
      releaseButtons[0]?.click();
      releaseButtons[1]?.click();
    });

    expect(onReleaseBlock).toHaveBeenNthCalledWith(1, "block-five-hour");
    expect(onReleaseBlock).toHaveBeenNthCalledWith(2, "block-opus");
  });
});

