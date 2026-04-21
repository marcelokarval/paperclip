import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { testEnvironment } from "@paperclipai/adapter-claude-local/server";

const ORIGINAL_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_BEDROCK = process.env.CLAUDE_CODE_USE_BEDROCK;
const ORIGINAL_BEDROCK_URL = process.env.ANTHROPIC_BEDROCK_BASE_URL;

afterEach(() => {
  if (ORIGINAL_ANTHROPIC === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC;
  }
  if (ORIGINAL_BEDROCK === undefined) {
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
  } else {
    process.env.CLAUDE_CODE_USE_BEDROCK = ORIGINAL_BEDROCK;
  }
  if (ORIGINAL_BEDROCK_URL === undefined) {
    delete process.env.ANTHROPIC_BEDROCK_BASE_URL;
  } else {
    process.env.ANTHROPIC_BEDROCK_BASE_URL = ORIGINAL_BEDROCK_URL;
  }
});

describe("claude_local environment diagnostics", () => {
  it("returns a warning (not an error) when ANTHROPIC_API_KEY is set in host environment", async () => {
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.ANTHROPIC_BEDROCK_BASE_URL;
    process.env.ANTHROPIC_API_KEY = "sk-test-host";

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "claude_local",
      config: {
        command: process.execPath,
        cwd: process.cwd(),
      },
    });

    expect(result.status).toBe("warn");
    expect(
      result.checks.some(
        (check) =>
          check.code === "claude_anthropic_api_key_overrides_subscription" &&
          check.level === "warn",
      ),
    ).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
  });

  it("returns a warning (not an error) when ANTHROPIC_API_KEY is set in adapter env", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.ANTHROPIC_BEDROCK_BASE_URL;

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "claude_local",
      config: {
        command: process.execPath,
        cwd: process.cwd(),
        env: {
          ANTHROPIC_API_KEY: "sk-test-config",
        },
      },
    });

    expect(result.status).toBe("warn");
    expect(
      result.checks.some(
        (check) =>
          check.code === "claude_anthropic_api_key_overrides_subscription" &&
          check.level === "warn",
      ),
    ).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
  });

  it("returns bedrock auth info when CLAUDE_CODE_USE_BEDROCK is set in host environment", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "claude_local",
      config: {
        command: process.execPath,
        cwd: process.cwd(),
      },
    });

    expect(
      result.checks.some(
        (check) =>
          check.code === "claude_bedrock_auth" && check.level === "info",
      ),
    ).toBe(true);
    expect(
      result.checks.some(
        (check) => check.code === "claude_subscription_mode_possible",
      ),
    ).toBe(false);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
  });

  it("returns bedrock auth info when CLAUDE_CODE_USE_BEDROCK is set in adapter env", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "claude_local",
      config: {
        command: process.execPath,
        cwd: process.cwd(),
        env: {
          CLAUDE_CODE_USE_BEDROCK: "1",
        },
      },
    });

    expect(
      result.checks.some(
        (check) =>
          check.code === "claude_bedrock_auth" && check.level === "info",
      ),
    ).toBe(true);
    expect(
      result.checks.some(
        (check) => check.code === "claude_subscription_mode_possible",
      ),
    ).toBe(false);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
  });

  it("bedrock auth takes precedence over missing ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_USE_BEDROCK = "1";

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "claude_local",
      config: {
        command: process.execPath,
        cwd: process.cwd(),
      },
    });

    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("claude_bedrock_auth");
    expect(codes).not.toContain("claude_subscription_mode_possible");
    expect(codes).not.toContain("claude_anthropic_api_key_overrides_subscription");
  });

  it("creates a missing working directory when cwd is absolute", async () => {
    const cwd = path.join(
      os.tmpdir(),
      `paperclip-claude-local-cwd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      "workspace",
    );

    await fs.rm(path.dirname(cwd), { recursive: true, force: true });

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "claude_local",
      config: {
        command: process.execPath,
        cwd,
      },
    });

    expect(result.checks.some((check) => check.code === "claude_cwd_valid")).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
    const stats = await fs.stat(cwd);
    expect(stats.isDirectory()).toBe(true);
    await fs.rm(path.dirname(cwd), { recursive: true, force: true });
  });

  it("runs the hello probe with low effort by default", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-claude-probe-args-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const argsPath = path.join(root, "args.txt");
    const fakeClaude = path.join(binDir, "claude");
    const originalPath = process.env.PATH;
    const script = [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$CAPTURE_ARGS_PATH\"",
      "cat >/dev/null",
      "printf '%s\\n' '{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}}'",
      "printf '%s\\n' '{\"type\":\"result\",\"result\":\"hello\",\"usage\":{\"input_tokens\":1,\"cache_read_input_tokens\":0,\"output_tokens\":1},\"total_cost_usd\":0}'",
      "exit 0",
      "",
    ].join("\n");

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(fakeClaude, script, "utf8");
      await fs.chmod(fakeClaude, 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_CODE_USE_BEDROCK;
      delete process.env.ANTHROPIC_BEDROCK_BASE_URL;

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "claude_local",
        probe: "live",
        config: {
          command: "claude",
          cwd,
          env: {
            CAPTURE_ARGS_PATH: argsPath,
          },
        },
      });

      expect(result.status).toBe("pass");
      expect(
        result.checks.some((check) => check.code === "claude_hello_probe_optimized" && check.detail === "effort=low"),
      ).toBe(true);
      const args = await fs.readFile(argsPath, "utf8");
      expect(args).toContain("--effort");
      expect(args).toContain("low");
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("skips the live hello probe in quick mode", async () => {
    const root = path.join(os.tmpdir(), `paperclip-claude-quick-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const fakeClaude = path.join(binDir, "claude");
    const originalPath = process.env.PATH;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.ANTHROPIC_BEDROCK_BASE_URL;

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(fakeClaude, "#!/bin/sh\nprintf 'claude 0.0.0\\n'\nexit 0\n", "utf8");
      await fs.chmod(fakeClaude, 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "claude_local",
        probe: "quick",
        config: {
          command: "claude",
          cwd,
        },
      });

      expect(result.checks.some((check) => check.code === "claude_live_probe_skipped")).toBe(true);
      expect(result.checks.some((check) => check.code === "claude_hello_probe_optimized")).toBe(false);
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
