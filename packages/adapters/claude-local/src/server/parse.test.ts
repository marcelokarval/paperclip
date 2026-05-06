import { describe, expect, it } from "vitest";
import {
  extractClaudeRateLimitBlock,
  extractClaudeRetryNotBefore,
  isClaudeTransientUpstreamError,
} from "./parse.js";

describe("isClaudeTransientUpstreamError", () => {
  it("classifies overloads as transient but hard usage caps as provider blocks", () => {
    for (const errorMessage of [
      "rate_limit_error",
      "server overloaded",
      "service unavailable",
    ]) {
      expect(isClaudeTransientUpstreamError({ errorMessage })).toBe(true);
    }
    expect(isClaudeTransientUpstreamError({ errorMessage: "You're out of extra usage · resets 4pm" })).toBe(false);
  });

  it("does not classify login, max-turns, or unknown session failures as transient", () => {
    expect(isClaudeTransientUpstreamError({ errorMessage: "please run claude login" })).toBe(false);
    expect(isClaudeTransientUpstreamError({ parsed: { subtype: "error_max_turns" } })).toBe(false);
    expect(isClaudeTransientUpstreamError({ errorMessage: "unknown session abc" })).toBe(false);
  });

  it("extracts local retry windows from extra-usage reset messages", () => {
    const retryAt = extractClaudeRetryNotBefore(
      { errorMessage: "You're out of extra usage · resets 4pm" },
      new Date(2026, 3, 22, 15, 0, 0),
    );

    expect(retryAt?.getTime()).toBe(new Date(2026, 3, 22, 16, 0, 0).getTime());
  });

  it("extracts structured rate-limit events as provider blocks", () => {
    const stdout = JSON.stringify({
      type: "rate_limit_event",
      message: "You've hit your limit · resets 8pm (Europe/Berlin)",
      rate_limit_info: {
        limit_kind: "five_hour",
        resets_at: "2026-05-05T18:00:00.000Z",
      },
    });

    expect(extractClaudeRateLimitBlock({ stdout })).toEqual({
      provider: "anthropic",
      adapterType: "claude_local",
      limitKind: "five_hour",
      modelFamily: null,
      resetsAt: "2026-05-05T18:00:00.000Z",
    });
  });
});
