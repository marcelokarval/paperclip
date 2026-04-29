import { describe, expect, it } from "vitest";
import {
  buildRepositoryBaselineReviewRequestMarker,
  buildRepositoryBaselineReviewResponseMarker,
  hasRepositoryBaselineReviewRequestForFingerprint,
  hasRepositoryBaselineReviewResponseForFingerprint,
  readRepositoryBaselineReviewRequestFingerprint,
  readRepositoryBaselineReviewResponseFingerprint,
} from "../services/repository-baseline-review-comments.js";

describe("repository baseline review comment markers", () => {
  it("encodes and reads request fingerprints", () => {
    const marker = buildRepositoryBaselineReviewRequestMarker("fp-1");
    expect(marker).toContain("fp-1");
    expect(readRepositoryBaselineReviewRequestFingerprint(marker)).toBe("fp-1");
  });

  it("encodes and reads response fingerprints", () => {
    const marker = buildRepositoryBaselineReviewResponseMarker("fp-2");
    expect(marker).toContain("fp-2");
    expect(readRepositoryBaselineReviewResponseFingerprint(marker)).toBe("fp-2");
  });

  it("matches request and response comments by fingerprint", () => {
    const comments = [
      { body: buildRepositoryBaselineReviewRequestMarker("fp-1") },
      { body: buildRepositoryBaselineReviewResponseMarker("fp-2") },
    ];

    expect(hasRepositoryBaselineReviewRequestForFingerprint(comments, "fp-1")).toBe(true);
    expect(hasRepositoryBaselineReviewRequestForFingerprint(comments, "fp-2")).toBe(false);
    expect(hasRepositoryBaselineReviewResponseForFingerprint(comments, "fp-2")).toBe(true);
    expect(hasRepositoryBaselineReviewResponseForFingerprint(comments, "fp-1")).toBe(false);
  });
});
