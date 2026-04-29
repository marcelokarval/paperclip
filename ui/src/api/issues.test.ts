import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./client", () => ({
  api: mockApi,
}));

import { issuesApi } from "./issues";

describe("issuesApi.list", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockReset();
  });

  it("passes parentId through to the company issues endpoint", async () => {
    await issuesApi.list("company-1", { parentId: "issue-parent-1", limit: 25 });

    expect(mockApi.get).toHaveBeenCalledWith(
      "/companies/company-1/issues?parentId=issue-parent-1&limit=25",
    );
  });

  it("posts issue comments and accepts duplicate baseline review skip responses", async () => {
    mockApi.post.mockResolvedValue({ skipped: "duplicate_baseline_review_request" });

    await expect(issuesApi.addComment("issue-1", "hello")).resolves.toEqual({
      skipped: "duplicate_baseline_review_request",
    });

    expect(mockApi.post).toHaveBeenCalledWith("/issues/issue-1/comments", {
      body: "hello",
    });
  });
});
