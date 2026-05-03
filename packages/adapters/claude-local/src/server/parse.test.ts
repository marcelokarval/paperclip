import { describe, expect, it } from "vitest";
import {
  extractClaudeRetryNotBefore,
  isClaudeTransientUpstreamError,
} from "./parse.js";

describe("isClaudeTransientUpstreamError", () => {
  it("classifies rate limits, overloads, and usage caps as transient", () => {
    for (const errorMessage of [
      "rate_limit_error",
      "server overloaded",
      "service unavailable",
      "Claude usage limit reached — weekly limit reached. Try again in 2 days.",
      "You're out of extra usage · resets 4pm",
    ]) {
      expect(isClaudeTransientUpstreamError({ errorMessage })).toBe(true);
    }
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
});
