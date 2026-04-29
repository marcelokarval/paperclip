const REQUEST_MARKER = "<!-- paperclip:baseline-ceo-review-request";
const RESPONSE_MARKER = "<!-- paperclip:baseline-ceo-review-response";
const DECISION_MARKER = "<!-- paperclip:baseline-ceo-review-decision";

function escapeAttribute(value: string) {
  return value.replace(/"/g, "&quot;");
}

function readMarkerFingerprint(body: string, markerPrefix: string) {
  const pattern = new RegExp(`${markerPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+fingerprint=\"([^\"]+)\"\\s*-->`, "i");
  const match = body.match(pattern);
  return match?.[1]?.trim() || null;
}

export function buildRepositoryBaselineReviewRequestMarker(fingerprint: string | null | undefined) {
  const normalized = fingerprint?.trim() || null;
  if (!normalized) return `${REQUEST_MARKER} -->`;
  return `${REQUEST_MARKER} fingerprint="${escapeAttribute(normalized)}" -->`;
}

export function buildRepositoryBaselineReviewResponseMarker(fingerprint: string | null | undefined) {
  const normalized = fingerprint?.trim() || null;
  if (!normalized) return `${RESPONSE_MARKER} -->`;
  return `${RESPONSE_MARKER} fingerprint="${escapeAttribute(normalized)}" -->`;
}

export type RepositoryBaselineReviewDecision =
  | "sufficient_for_first_cto"
  | "insufficient_for_first_cto"
  | "unknown";

export function buildRepositoryBaselineReviewDecisionMarker(decision: RepositoryBaselineReviewDecision) {
  return `${DECISION_MARKER} decision="${escapeAttribute(decision)}" -->`;
}

export function readRepositoryBaselineReviewRequestFingerprint(body: string) {
  return readMarkerFingerprint(body, REQUEST_MARKER);
}

export function readRepositoryBaselineReviewResponseFingerprint(body: string) {
  return readMarkerFingerprint(body, RESPONSE_MARKER);
}

export function readRepositoryBaselineReviewDecision(body: string): RepositoryBaselineReviewDecision | null {
  const pattern = new RegExp(`${DECISION_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+decision=\"([^\"]+)\"\\s*-->`, "i");
  const match = body.match(pattern);
  const decision = match?.[1]?.trim();
  if (decision === "sufficient_for_first_cto" || decision === "insufficient_for_first_cto" || decision === "unknown") {
    return decision;
  }
  return null;
}

export function isRepositoryBaselineReviewRequestComment(body: string) {
  return body.includes(REQUEST_MARKER);
}

export function isRepositoryBaselineReviewResponseComment(body: string) {
  return body.includes(RESPONSE_MARKER);
}

export function hasRepositoryBaselineReviewRequestForFingerprint(
  comments: readonly Pick<{ body: string }, "body">[] | null | undefined,
  fingerprint: string | null | undefined,
) {
  const normalized = fingerprint?.trim() || null;
  return (comments ?? []).some((comment) => {
    if (!isRepositoryBaselineReviewRequestComment(comment.body)) return false;
    if (!normalized) return true;
    return readRepositoryBaselineReviewRequestFingerprint(comment.body) === normalized;
  });
}

export function hasRepositoryBaselineReviewResponseForFingerprint(
  comments: readonly Pick<{ body: string }, "body">[] | null | undefined,
  fingerprint: string | null | undefined,
) {
  const normalized = fingerprint?.trim() || null;
  return (comments ?? []).some((comment) => {
    if (!isRepositoryBaselineReviewResponseComment(comment.body)) return false;
    if (!normalized) return true;
    return readRepositoryBaselineReviewResponseFingerprint(comment.body) === normalized;
  });
}
