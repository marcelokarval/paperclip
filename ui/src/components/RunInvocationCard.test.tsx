// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { HeartbeatRun } from "@paperclipai/shared";
import { ThemeProvider } from "../context/ThemeContext";
import {
  AgentCliLoginResultBlock,
  RunInvocationCard,
  isCodexAuthRequiredRun,
} from "../pages/AgentDetail";

describe("RunInvocationCard", () => {
  it("keeps verbose invocation details collapsed by default", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunInvocationCard
          payload={{
            adapterType: "claude_local",
            cwd: "/tmp/workspace",
            command: "claude",
            commandArgs: ["--dangerously-skip-permissions"],
            commandNotes: ["Prompt is piped to claude via stdin."],
            prompt: "very long prompt body",
            context: { triggeredBy: "board" },
            env: { ANTHROPIC_API_KEY: "***REDACTED***" },
          }}
          censorUsernameInLogs={false}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("Invocation");
    expect(html).toContain("Adapter:");
    expect(html).toContain("Working dir:");
    expect(html).toContain("Details");
    expect(html).not.toContain("Command:");
    expect(html).not.toContain("Prompt is piped to claude via stdin.");
    expect(html).not.toContain("very long prompt body");
    expect(html).not.toContain("ANTHROPIC_API_KEY");
    expect(html).not.toContain("triggeredBy");
  });
});

describe("Agent CLI login UI", () => {
  it("renders shared login URL, stdout, and stderr output", () => {
    const html = renderToStaticMarkup(
      <AgentCliLoginResultBlock
        result={{
          exitCode: 0,
          signal: null,
          timedOut: false,
          loginUrl: "https://example.test/codex-login",
          stdout: "Open this page to authenticate.",
          stderr: "warning output",
        }}
      />,
    );

    expect(html).toContain("Login URL:");
    expect(html).toContain("https://example.test/codex-login");
    expect(html).toContain("Open this page to authenticate.");
    expect(html).toContain("warning output");
  });

  it("detects Codex local auth failures from current text-only errors", () => {
    const run = {
      errorCode: null,
      error: "Codex CLI is not logged in. Please run `codex login`.",
    } as HeartbeatRun;

    expect(isCodexAuthRequiredRun(run, "codex_local")).toBe(true);
    expect(isCodexAuthRequiredRun(run, "claude_local")).toBe(false);
  });
});
