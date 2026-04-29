export type BaselineReviewDecision = "sufficient_for_first_cto" | "insufficient_for_first_cto" | "unknown";

export interface ParsedBaselineReviewDecision {
  decision: BaselineReviewDecision;
  fingerprint: string | null;
}

const RESPONSE_MARKER_PATTERN = /<!--\s*paperclip:baseline-ceo-review-response(?:\s+fingerprint="([^"]+)")?\s*-->/i;
const DECISION_MARKER_PATTERN = /<!--\s*paperclip:baseline-ceo-review-decision\s+decision="([^"]+)"\s*-->/i;
const ALL_BASELINE_REVIEW_MARKERS_PATTERN = /<!--\s*paperclip:baseline-ceo-review-(?:response|decision)[\s\S]*?-->/gi;

export function parseBaselineReviewDecision(body: string): ParsedBaselineReviewDecision | null {
  const decisionMatch = body.match(DECISION_MARKER_PATTERN);
  const rawDecision = decisionMatch?.[1]?.trim();
  if (
    rawDecision !== "sufficient_for_first_cto"
    && rawDecision !== "insufficient_for_first_cto"
    && rawDecision !== "unknown"
  ) {
    return null;
  }

  const responseMatch = body.match(RESPONSE_MARKER_PATTERN);
  const fingerprint = responseMatch?.[1]?.trim() || null;
  return {
    decision: rawDecision,
    fingerprint,
  };
}

export function stripBaselineReviewDecisionMarkers(body: string) {
  return body
    .replace(ALL_BASELINE_REVIEW_MARKERS_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
