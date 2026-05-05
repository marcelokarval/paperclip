import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexLoginArgs, extractCodexLoginUrl, runCodexLogin } from "./login.js";

describe("buildCodexLoginArgs", () => {
  it("uses Codex device-auth login by default", () => {
    expect(buildCodexLoginArgs({})).toEqual(["login", "--device-auth"]);
  });

  it("allows adapter config to override login args", () => {
    expect(buildCodexLoginArgs({ loginArgs: ["login"] })).toEqual(["login"]);
  });

  it("can disable device auth for older Codex CLI behavior", () => {
    expect(buildCodexLoginArgs({ deviceAuth: false })).toEqual(["login"]);
  });
});

describe("extractCodexLoginUrl", () => {
  it("extracts an OpenAI login URL from mixed process output", () => {
    expect(
      extractCodexLoginUrl(
        "Open https://auth.openai.com/activate?user_code=ABCD-1234 and enter the code.",
      ),
    ).toBe("https://auth.openai.com/activate?user_code=ABCD-1234");
  });

  it("prefers OpenAI or ChatGPT URLs over incidental URLs", () => {
    expect(
      extractCodexLoginUrl(
        "Docs: https://example.com/docs\nSign in: https://chatgpt.com/activate?code=ZXCV.",
      ),
    ).toBe("https://chatgpt.com/activate?code=ZXCV");
  });

  it("returns null when no URL is present", () => {
    expect(extractCodexLoginUrl("Complete login in your browser.")).toBeNull();
  });
});

describe("runCodexLogin", () => {
  it("runs Codex login with normalized CODEX_HOME and returns process output shape", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-codex-login-"));
    try {
      const fakeCodex = path.join(root, "fake-codex");
      await fs.writeFile(
        fakeCodex,
        [
          "#!/bin/sh",
          "printf 'args=%s\\n' \"$*\"",
          "printf 'codex_home=%s\\n' \"$CODEX_HOME\"",
          "printf 'Open https://auth.openai.com/activate?user_code=ABCD-1234\\n'",
          "printf 'fake login stderr\\n' >&2",
        ].join("\n"),
        "utf8",
      );
      await fs.chmod(fakeCodex, 0o755);

      const configuredCodexHome = path.relative(process.cwd(), path.join(root, "relative-codex-home"));
      const expectedCodexHome = path.resolve(configuredCodexHome);
      const result = await runCodexLogin({
        runId: "run-1",
        agent: {
          id: "agent-1",
          name: "Codex Test Agent",
          companyId: "company-1",
          adapterType: "codex_local",
          adapterConfig: {},
        },
        config: {
          command: fakeCodex,
          cwd: root,
          env: {
            CODEX_HOME: `  ${configuredCodexHome}  `,
          },
        },
      });

      expect(result).toEqual({
        exitCode: 0,
        signal: null,
        timedOut: false,
        stdout: expect.stringContaining("Open https://auth.openai.com/activate?user_code=ABCD-1234\n"),
        stderr: "fake login stderr\n",
        loginUrl: "https://auth.openai.com/activate?user_code=ABCD-1234",
      });
      expect(result.stdout).toContain("args=login --device-auth\n");
      expect(result.stdout).toContain(`codex_home=${expectedCodexHome}\n`);
      expect(result.stdout).not.toContain(`codex_home=  ${configuredCodexHome}  \n`);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
