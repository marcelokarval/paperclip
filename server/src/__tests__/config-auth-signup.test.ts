import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

async function loadConfigWithFileConfig(fileConfig: unknown = null) {
  vi.resetModules();
  vi.doMock("../config-file.js", () => ({
    readConfigFile: vi.fn(() => fileConfig),
  }));
  vi.doMock("../paths.js", () => ({
    resolvePaperclipEnvPath: vi.fn(() => "/tmp/paperclip-test-missing.env"),
  }));
  vi.doMock("../worktree-config.js", () => ({
    maybeRepairLegacyWorktreeConfigAndEnvFiles: vi.fn(),
  }));
  vi.doMock("dotenv", () => ({
    config: vi.fn(),
  }));
  vi.doMock("node:child_process", () => ({
    execFileSync: vi.fn(() => {
      throw new Error("tailscale unavailable in tests");
    }),
  }));
  vi.doMock("../home-paths.js", () => ({
    resolveDefaultBackupDir: vi.fn(() => "/tmp/paperclip-test/backups"),
    resolveDefaultEmbeddedPostgresDir: vi.fn(() => "/tmp/paperclip-test/postgres"),
    resolveDefaultSecretsKeyFilePath: vi.fn(() => "/tmp/paperclip-test/secrets/master.key"),
    resolveDefaultStorageDir: vi.fn(() => "/tmp/paperclip-test/storage"),
    resolveHomeAwarePath: vi.fn((value: string) => value),
  }));

  const { loadConfig } = await import("../config.js");
  return loadConfig();
}

describe("auth signup configuration", () => {
  beforeEach(() => {
    restoreEnv();
    process.env.PAPERCLIP_DEPLOYMENT_MODE = "authenticated";
    process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE = "public";
    process.env.PAPERCLIP_AUTH_BASE_URL_MODE = "explicit";
    process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL = "https://paperclip.example.com";
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("disables public signup by default for authenticated public deployments", async () => {
    const config = await loadConfigWithFileConfig();

    expect(config.authDisableSignUp).toBe(true);
  });

  it("allows an explicit env override when the operator intentionally enables signup", async () => {
    process.env.PAPERCLIP_AUTH_DISABLE_SIGN_UP = "false";

    const config = await loadConfigWithFileConfig();

    expect(config.authDisableSignUp).toBe(false);
  });

  it("keeps private authenticated deployments open for signup by default", async () => {
    process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE = "private";

    const config = await loadConfigWithFileConfig();

    expect(config.authDisableSignUp).toBe(false);
  });
});
