import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;

    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  api: mockApi,
}));

import { agentsApi } from "./agents";

describe("agentsApi local CLI logins", () => {
  beforeEach(() => {
    mockApi.post.mockReset();
    mockApi.post.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      loginUrl: null,
      stdout: "",
      stderr: "",
    });
  });

  it("posts Claude login to the existing route", async () => {
    await agentsApi.loginWithClaude("agent-1", "company-1");

    expect(mockApi.post).toHaveBeenCalledWith(
      "/agents/agent-1/claude-login?companyId=company-1",
      {},
    );
  });

  it("posts Codex login to the expected route", async () => {
    await agentsApi.loginWithCodex("agent-1", "company-1");

    expect(mockApi.post).toHaveBeenCalledWith(
      "/agents/agent-1/codex-login?companyId=company-1",
      {},
    );
  });
});
