import { describe, expect, it } from "vitest";
import {
  parseBaselineReviewDecision,
  stripBaselineReviewDecisionMarkers,
} from "./baseline-review-decision";

describe("baseline review decision helpers", () => {
  it("parses the structured first-CTO decision and fingerprint", () => {
    const parsed = parseBaselineReviewDecision([
      "Agent notes.",
      "",
      "<!-- paperclip:baseline-ceo-review-response fingerprint=\"ready:2026-04-25T14:02:15.171Z|repository_context_accepted\" -->",
      "",
      "<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->",
    ].join("\n"));

    expect(parsed).toEqual({
      decision: "sufficient_for_first_cto",
      fingerprint: "ready:2026-04-25T14:02:15.171Z|repository_context_accepted",
    });
  });

  it("strips hidden baseline review markers from display markdown", () => {
    const body = [
      "Agent notes.",
      "",
      "<!-- paperclip:baseline-ceo-review-response fingerprint=\"fp-1\" -->",
      "",
      "<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->",
    ].join("\n");

    expect(stripBaselineReviewDecisionMarkers(body)).toBe("Agent notes.");
  });
});
