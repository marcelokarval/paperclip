import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { testEnvironment } from "@paperclipai/adapter-codex-local/server";

const itWindows = process.platform === "win32" ? it : it.skip;

describe("codex_local environment diagnostics", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("creates a missing working directory when cwd is absolute", async () => {
    const cwd = path.join(
      os.tmpdir(),
      `paperclip-codex-local-cwd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      "workspace",
    );

    await fs.rm(path.dirname(cwd), { recursive: true, force: true });

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        command: process.execPath,
        cwd,
      },
    });

    expect(result.checks.some((check) => check.code === "codex_cwd_valid")).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(false);
    const stats = await fs.stat(cwd);
    expect(stats.isDirectory()).toBe(true);
    await fs.rm(path.dirname(cwd), { recursive: true, force: true });
  });

  it("emits codex_native_auth_present when ~/.codex/auth.json exists and OPENAI_API_KEY is unset", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-codex-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const codexHome = path.join(root, ".codex");
    const cwd = path.join(root, "workspace");

    try {
      await fs.mkdir(codexHome, { recursive: true });
      await fs.writeFile(
        path.join(codexHome, "auth.json"),
        JSON.stringify({ accessToken: "fake-token", accountId: "acct-1" }),
      );

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "codex_local",
        config: {
          command: "codex",
          cwd,
          env: { CODEX_HOME: codexHome },
        },
      });

      expect(result.checks.some((check) => check.code === "codex_native_auth_present")).toBe(true);
      expect(result.checks.some((check) => check.code === "codex_openai_api_key_missing")).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("emits codex_openai_api_key_missing when neither env var nor native auth exists", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-codex-noauth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const codexHome = path.join(root, ".codex");
    const cwd = path.join(root, "workspace");

    try {
      await fs.mkdir(codexHome, { recursive: true });
      // No auth.json written

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "codex_local",
        config: {
          command: process.execPath,
          cwd,
          env: { CODEX_HOME: codexHome },
        },
      });

      expect(result.checks.some((check) => check.code === "codex_openai_api_key_missing")).toBe(true);
      expect(result.checks.some((check) => check.code === "codex_native_auth_present")).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("runs the hello probe with low reasoning effort and fast mode when supported", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-codex-probe-args-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const argsPath = path.join(root, "args.txt");
    const fakeCodex = path.join(binDir, "codex");
    const originalPath = process.env.PATH;
    const script = [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$CAPTURE_ARGS_PATH\"",
      "cat >/dev/null",
      "printf '%s\\n' '{\"type\":\"thread.started\",\"thread_id\":\"test-thread\"}'",
      "printf '%s\\n' '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"hello\"}}'",
      "printf '%s\\n' '{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"cached_input_tokens\":0,\"output_tokens\":1}}'",
      "exit 0",
      "",
    ].join("\n");

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(fakeCodex, script, "utf8");
      await fs.chmod(fakeCodex, 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "codex_local",
        probe: "live",
        config: {
          command: "codex",
          cwd,
          model: "gpt-5.4",
          env: {
            OPENAI_API_KEY: "test-key",
            CAPTURE_ARGS_PATH: argsPath,
          },
        },
      });

      expect(result.status).toBe("pass");
      expect(
        result.checks.some((check) => check.code === "codex_hello_probe_optimized" && check.detail?.includes("fastMode=enabled")),
      ).toBe(true);
      const args = await fs.readFile(argsPath, "utf8");
      expect(args).toContain('model_reasoning_effort="low"');
      expect(args).toContain('service_tier="fast"');
      expect(args).toContain("features.fast_mode=true");
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
    const root = path.join(os.tmpdir(), `paperclip-codex-quick-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const fakeCodex = path.join(binDir, "codex");
    const originalPath = process.env.PATH;

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(fakeCodex, "#!/bin/sh\nprintf 'codex 0.0.0\\n'\nexit 0\n", "utf8");
      await fs.chmod(fakeCodex, 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "codex_local",
        probe: "quick",
        config: {
          command: "codex",
          cwd,
          env: { OPENAI_API_KEY: "test-key" },
        },
      });

      expect(result.checks.some((check) => check.code === "codex_live_probe_skipped")).toBe(true);
      expect(result.checks.some((check) => check.code === "codex_hello_probe_optimized")).toBe(false);
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  itWindows("skips the hello probe when adapter env overrides PATH even if Codex is resolvable", async () => {
    const root = path.join(
      os.tmpdir(),
      `paperclip-codex-local-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    const fakeCodex = path.join(binDir, "codex.cmd");
    const script = [
      "@echo off",
      "echo {\"type\":\"thread.started\",\"thread_id\":\"test-thread\"}",
      "echo {\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"hello\"}}",
      "echo {\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"cached_input_tokens\":0,\"output_tokens\":1}}",
      "exit /b 0",
      "",
    ].join("\r\n");

    try {
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(fakeCodex, script, "utf8");

      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "codex_local",
        config: {
          command: "codex",
          cwd,
          env: {
            OPENAI_API_KEY: "test-key",
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
          },
        },
      });

      expect(result.status).toBe("warn");
      expect(
        result.checks.some((check) => check.code === "codex_hello_probe_skipped_path_override"),
      ).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
