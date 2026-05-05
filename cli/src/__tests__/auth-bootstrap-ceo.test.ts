import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const mocks = vi.hoisted(() => {
  const log = {
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  };

  const db = {
    $client: {
      end: vi.fn().mockResolvedValue(undefined),
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => ({
          then: vi.fn((resolve: (rows: Array<{ expiresAt: Date }>) => unknown) =>
            Promise.resolve(resolve([{ expiresAt: new Date("2026-05-04T00:00:00.000Z") }]))
          ),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          then: vi.fn((resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve([]))),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };

  return {
    createDb: vi.fn(() => db),
    db,
    log,
  };
});

vi.mock("@clack/prompts", () => ({ log: mocks.log }));
vi.mock("picocolors", () => ({
  default: {
    cyan: (value: string) => value,
    dim: (value: string) => value,
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "and"),
  eq: vi.fn(() => "eq"),
  gt: vi.fn(() => "gt"),
  isNull: vi.fn(() => "isNull"),
}));
vi.mock("@paperclipai/db", () => ({
  createDb: mocks.createDb,
  instanceUserRoles: { role: "role" },
  invites: {
    acceptedAt: "acceptedAt",
    expiresAt: "expiresAt",
    inviteType: "inviteType",
    revokedAt: "revokedAt",
  },
}));

describe("bootstrapCeoInvite", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    mocks.createDb.mockClear();
    mocks.db.insert.mockClear();
    mocks.db.select.mockClear();
    mocks.db.update.mockClear();
    mocks.db.$client.end.mockClear();
    mocks.log.error.mockClear();
    mocks.log.info.mockClear();
    mocks.log.message.mockClear();
    mocks.log.success.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("creates a bootstrap invite from env-only authenticated deployments", async () => {
    process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
    process.env.DATABASE_URL = "postgresql://paperclip:test@postgres:5432/paperclip";
    process.env.PAPERCLIP_PUBLIC_URL = "https://paperclip.example.com/";
    const missingConfig = path.join(os.tmpdir(), `paperclip-missing-${Date.now()}`, "config.json");

    const { bootstrapCeoInvite } = await import("../commands/auth-bootstrap-ceo.js");
    await bootstrapCeoInvite({ config: missingConfig });

    expect(mocks.createDb).toHaveBeenCalledWith("postgresql://paperclip:test@postgres:5432/paperclip");
    expect(mocks.db.insert).toHaveBeenCalled();
    expect(mocks.log.success).toHaveBeenCalledWith("Created bootstrap CEO invite.");
    expect(mocks.log.message.mock.calls.some((args) => String(args[0]).includes("https://paperclip.example.com/invite/pcp_bootstrap_"))).toBe(true);
    expect(mocks.log.error).not.toHaveBeenCalled();
  });
});
