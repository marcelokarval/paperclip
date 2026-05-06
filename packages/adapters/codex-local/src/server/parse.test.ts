import { describe, expect, it } from "vitest";
import {
  extractCodexRateLimitBlock,
  extractCodexRetryNotBefore,
  isCodexTransientUpstreamError,
  isCodexUnknownSessionError,
  parseCodexJsonl,
} from "./parse.js";

describe("parseCodexJsonl", () => {
  it("captures session id, assistant summary, usage, and error message", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "Recovered response" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 },
      }),
      JSON.stringify({ type: "turn.failed", error: { message: "resume failed" } }),
    ].join("\n");

    expect(parseCodexJsonl(stdout)).toEqual({
      sessionId: "thread_123",
      summary: "Recovered response",
      usage: {
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 4,
      },
      errorMessage: "resume failed",
    });
  });

  it("uses the last agent message as the summary when commentary updates precede the final answer", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "reasoning", text: "Checking the heartbeat procedure" },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "I’m checking out the issue and reading the docs now." },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "Fixed the issue and verified the targeted tests pass." },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 },
      }),
    ].join("\n");

    expect(parseCodexJsonl(stdout)).toEqual({
      sessionId: "thread_123",
      summary: "Fixed the issue and verified the targeted tests pass.",
      usage: {
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 4,
      },
      errorMessage: null,
    });
  });
});

describe("isCodexUnknownSessionError", () => {
  it("detects the current missing-rollout thread error", () => {
    expect(
      isCodexUnknownSessionError(
        "",
        "Error: thread/resume: thread/resume failed: no rollout found for thread id d448e715-7607-4bcc-91fc-7a3c0c5a9632",
      ),
    ).toBe(true);
  });

  it("still detects existing stale-session wordings", () => {
    expect(isCodexUnknownSessionError("unknown thread id", "")).toBe(true);
    expect(isCodexUnknownSessionError("", "state db missing rollout path for thread abc")).toBe(true);
  });

  it("does not classify unrelated Codex failures as stale sessions", () => {
    expect(isCodexUnknownSessionError("", "model overloaded")).toBe(false);
  });
});

describe("isCodexTransientUpstreamError", () => {
  it("classifies usage-limit windows as hard provider blocks and extracts the retry time", () => {
    const errorMessage = "You've hit your usage limit for GPT-5.3-Codex-Spark. Switch to another model now, or try again at 11:31 PM.";
    const now = new Date(2026, 3, 22, 22, 29, 2);

    expect(isCodexTransientUpstreamError({ errorMessage })).toBe(false);
    expect(extractCodexRetryNotBefore({ errorMessage }, now)?.getTime()).toBe(
      new Date(2026, 3, 22, 23, 31, 0, 0).getTime(),
    );
    expect(extractCodexRateLimitBlock({ errorMessage }, now)?.resetsAt).toBe(
      new Date(2026, 3, 22, 23, 31, 0, 0).toISOString(),
    );
  });

  it("classifies generic usage-limit credit messages and extracts the retry time", () => {
    const errorMessage =
      "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 3:35 AM.";
    const now = new Date(2026, 4, 5, 2, 55, 0);

    expect(isCodexTransientUpstreamError({ errorMessage })).toBe(false);
    expect(extractCodexRetryNotBefore({ errorMessage }, now)?.getTime()).toBe(
      new Date(2026, 4, 5, 3, 35, 0, 0).getTime(),
    );
    expect(extractCodexRateLimitBlock({ errorMessage }, now)).toMatchObject({
      provider: "openai",
      adapterType: "codex_local",
      limitKind: "usage_limit",
      modelFamily: null,
      resetsAt: new Date(2026, 4, 5, 3, 35, 0, 0).toISOString(),
    });
  });

  it("parses older relative usage-limit retry windows", () => {
    const errorMessage = "You've hit your usage limit. Try again in 4 days 20 hours 9 minutes.";
    const now = new Date("2026-04-23T03:29:02.000Z");

    expect(isCodexTransientUpstreamError({ errorMessage })).toBe(false);
    expect(extractCodexRetryNotBefore({ errorMessage }, now)?.toISOString()).toBe(
      "2026-04-27T23:38:02.000Z",
    );
  });

  it("parses explicit timezone hints on usage-limit retry windows", () => {
    const errorMessage = "You've hit your usage limit for GPT-5.3-Codex-Spark. Switch to another model now, or try again at 11:31 PM (America/Chicago).";
    const now = new Date("2026-04-23T03:29:02.000Z");

    expect(extractCodexRetryNotBefore({ errorMessage }, now)?.toISOString()).toBe(
      "2026-04-23T04:31:00.000Z",
    );
  });

  it("does not classify usage-limit messages without parseable retry windows as transient", () => {
    expect(
      isCodexTransientUpstreamError({
        errorMessage: "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.",
      }),
    ).toBe(false);
    expect(
      isCodexTransientUpstreamError({
        errorMessage: "You've hit your usage limit. Try again after your plan resets.",
      }),
    ).toBe(false);
  });

  it("classifies remote compaction failures as transient", () => {
    expect(
      isCodexTransientUpstreamError({
        stderr: "remote compact task failed because context window was exceeded",
      }),
    ).toBe(true);
  });

  it("classifies provider throttling and availability failures as transient", () => {
    for (const errorMessage of [
      "rate limited",
      "too many requests",
      "429",
      "service unavailable",
      "server overloaded",
    ]) {
      expect(isCodexTransientUpstreamError({ errorMessage })).toBe(true);
    }
  });

  it("does not classify authentication, setup, or config failures as transient", () => {
    for (const errorMessage of [
      "Invalid API key provided: sk-test. You can find your API key at https://platform.openai.com/account/api-keys.",
      "Login required. Run `codex login` to authenticate before using Codex.",
      "Permission denied while reading /home/user/.codex/config.toml",
      "Billing setup required. Add a payment method to continue using the API.",
      "Authentication failed. Please sign in and try again later.",
    ]) {
      expect(isCodexTransientUpstreamError({ errorMessage })).toBe(false);
    }
  });
});
