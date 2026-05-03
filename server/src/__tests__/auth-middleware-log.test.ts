import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { actorMiddleware } from "../middleware/auth.js";
import { logger } from "../middleware/logger.js";

describe("actorMiddleware auth logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts sensitive query params when session resolution logging includes the URL", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);
    const middleware = actorMiddleware({} as Db, {
      deploymentMode: "authenticated",
      resolveSession: async () => {
        throw new Error("session exploded");
      },
    });
    const req = {
      actor: { type: "none", source: "none" },
      method: "GET",
      originalUrl: "/api/auth/session?token=abc123&password=hunter2&safe=visible",
      header: vi.fn(() => undefined),
    } as unknown as Request;
    const next = vi.fn();

    await middleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      method: "GET",
      url: "/api/auth/session?token=%5BREDACTED%5D&password=%5BREDACTED%5D&safe=visible",
    });
    expect(JSON.stringify(warn.mock.calls[0]?.[0])).not.toContain("abc123");
    expect(JSON.stringify(warn.mock.calls[0]?.[0])).not.toContain("hunter2");
  });
});
