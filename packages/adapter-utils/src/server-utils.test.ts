import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPaperclipWorkspaceEnv,
  applyDirectPaperclipApiPolicy,
  buildInstructionSupplementalEnv,
  buildInstructionsPromptPrefix,
  renderPaperclipWakePrompt,
  resolvePaperclipWorkspaceBranch,
  resolveAllowedInstructionsFilePath,
  runChildProcess,
  shouldDisableDirectPaperclipApiForRun,
} from "./server-utils.js";

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid: number, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isPidAlive(pid);
}

describe("runChildProcess", () => {
  it("waits for onSpawn before sending stdin to the child", async () => {
    const spawnDelayMs = 150;
    const startedAt = Date.now();
    let onSpawnCompletedAt = 0;

    const result = await runChildProcess(
      randomUUID(),
      process.execPath,
      [
        "-e",
        "let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>data+=chunk);process.stdin.on('end',()=>process.stdout.write(data));",
      ],
      {
        cwd: process.cwd(),
        env: {},
        stdin: "hello from stdin",
        timeoutSec: 5,
        graceSec: 1,
        onLog: async () => {},
        onSpawn: async () => {
          await new Promise((resolve) => setTimeout(resolve, spawnDelayMs));
          onSpawnCompletedAt = Date.now();
        },
      },
    );
    const finishedAt = Date.now();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello from stdin");
    expect(onSpawnCompletedAt).toBeGreaterThanOrEqual(startedAt + spawnDelayMs);
    expect(finishedAt - startedAt).toBeGreaterThanOrEqual(spawnDelayMs);
  });

  it.skipIf(process.platform === "win32")("kills descendant processes on timeout via the process group", async () => {
    let descendantPid: number | null = null;

    const result = await runChildProcess(
      randomUUID(),
      process.execPath,
      [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
          "process.stdout.write(String(child.pid));",
          "setInterval(() => {}, 1000);",
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {},
        timeoutSec: 1,
        graceSec: 1,
        onLog: async () => {},
        onSpawn: async () => {},
      },
    );

    descendantPid = Number.parseInt(result.stdout.trim(), 10);
    expect(result.timedOut).toBe(true);
    expect(Number.isInteger(descendantPid) && descendantPid > 0).toBe(true);

    expect(await waitForPidExit(descendantPid!, 2_000)).toBe(true);
  });

  it.skipIf(process.platform === "win32")("cleans up inherited descendant processes after terminal result output", async () => {
    const startedAt = Date.now();

    const result = await runChildProcess(
      randomUUID(),
      process.execPath,
      [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'ignore'] });",
          "console.log(JSON.stringify({ type: 'child', pid: child.pid }));",
          "console.log(JSON.stringify({ type: 'result', ok: true }));",
          "process.exit(0);",
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {},
        timeoutSec: 5,
        graceSec: 1,
        onLog: async () => {},
        onSpawn: async () => {},
        terminalResultCleanup: {
          graceMs: 50,
          hasTerminalResult: (output) => output.includes('"type":"result"'),
        },
      },
    );

    const elapsedMs = Date.now() - startedAt;
    const childLine = result.stdout
      .split("\n")
      .find((line) => line.includes('"type":"child"'));
    expect(childLine).toBeTruthy();
    const descendantPid = Number.parseInt(String(JSON.parse(childLine!).pid), 10);

    expect(result.timedOut).toBe(false);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(Number.isInteger(descendantPid) && descendantPid > 0).toBe(true);
    expect(await waitForPidExit(descendantPid, 2_000)).toBe(true);
  });

  it.skipIf(process.platform === "win32")("does not run terminal cleanup before terminal result output", async () => {
    const result = await runChildProcess(
      randomUUID(),
      process.execPath,
      [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'ignore'] });",
          "console.log(JSON.stringify({ type: 'progress' }));",
          "process.exit(0);",
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {},
        timeoutSec: 1,
        graceSec: 1,
        onLog: async () => {},
        onSpawn: async () => {},
        terminalResultCleanup: {
          graceMs: 25,
          hasTerminalResult: (output) => output.includes('"type":"result"'),
        },
      },
    );

    expect(result.timedOut).toBe(true);
    expect(result.stdout).toContain('"type":"progress"');
  });
});

describe("applyPaperclipWorkspaceEnv", () => {
  it("applies non-empty workspace and agent home values", () => {
    const env = applyPaperclipWorkspaceEnv(
      { EXISTING: "true" },
      {
        workspaceCwd: "/repo",
        workspaceSource: "project",
        workspaceStrategy: "isolated",
        workspaceId: "workspace-1",
        workspaceRepoUrl: "https://example.test/repo.git",
        workspaceRepoRef: "main",
        workspaceBranch: "paperclip/work",
        workspaceWorktreePath: "/worktree",
        agentHome: "/agent-home",
      },
    );

    expect(env).toMatchObject({
      EXISTING: "true",
      PAPERCLIP_WORKSPACE_CWD: "/repo",
      PAPERCLIP_WORKSPACE_SOURCE: "project",
      PAPERCLIP_WORKSPACE_STRATEGY: "isolated",
      PAPERCLIP_WORKSPACE_ID: "workspace-1",
      PAPERCLIP_WORKSPACE_REPO_URL: "https://example.test/repo.git",
      PAPERCLIP_WORKSPACE_REPO_REF: "main",
      PAPERCLIP_WORKSPACE_BRANCH: "paperclip/work",
      PAPERCLIP_WORKSPACE_WORKTREE_PATH: "/worktree",
      AGENT_HOME: "/agent-home",
    });
  });

  it("skips empty, null, and undefined workspace values", () => {
    const env = applyPaperclipWorkspaceEnv(
      {},
      {
        workspaceCwd: "",
        workspaceSource: null,
        workspaceStrategy: undefined,
        workspaceId: "workspace-1",
        agentHome: "",
      },
    );

    expect(env).toEqual({
      PAPERCLIP_WORKSPACE_ID: "workspace-1",
    });
  });
});

describe("resolvePaperclipWorkspaceBranch", () => {
  it("prefers the server-emitted branchName field", () => {
    expect(
      resolvePaperclipWorkspaceBranch({
        branchName: "paperclip/server-shaped",
        branch: "paperclip/legacy",
      }),
    ).toBe("paperclip/server-shaped");
  });

  it("falls back to the legacy branch field", () => {
    expect(
      resolvePaperclipWorkspaceBranch({
        branch: "paperclip/legacy",
      }),
    ).toBe("paperclip/legacy");
  });
});

describe("buildInstructionsPromptPrefix", () => {
  it("includes a sibling project packet when present", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-instructions-prefix-"));
    const instructionsPath = path.join(root, "AGENTS.md");
    const packetPath = path.join(root, "PROJECT_PACKET.md");

    try {
      await fs.writeFile(instructionsPath, "# Agent\nRead the project packet.\n", "utf8");
      await fs.writeFile(packetPath, "# Project Packet\nProject: Prop4You\n", "utf8");

      const result = await buildInstructionsPromptPrefix({
        instructionsFilePath: instructionsPath,
        supplementalFileNames: ["PROJECT_PACKET.md"],
      });

      expect(result.prefix).toContain("# Agent");
      expect(result.prefix).toContain("## Supplemental instructions from ./PROJECT_PACKET.md");
      expect(result.prefix).toContain("Project: Prop4You");
      expect(result.prefix).toContain("Supplemental sibling instruction files were also loaded from ./PROJECT_PACKET.md.");
      expect(result.includedSupplementalPaths).toEqual(["./PROJECT_PACKET.md"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("buildInstructionSupplementalEnv", () => {
  it("exports project packet env hints when the supplemental packet is loaded", () => {
    const env = buildInstructionSupplementalEnv({
      effectiveInstructionsFilePath: "/tmp/paperclip/agent/AGENTS.md",
      includedSupplementalPaths: ["./PROJECT_PACKET.md"],
    });

    expect(env.PAPERCLIP_INSTRUCTIONS_FILE_PATH).toBe("/tmp/paperclip/agent/AGENTS.md");
    expect(env.PAPERCLIP_PROJECT_PACKET_PRESENT).toBe("true");
    expect(env.PAPERCLIP_PROJECT_PACKET_PATH).toBe("/tmp/paperclip/agent/PROJECT_PACKET.md");
  });
});

describe("resolveAllowedInstructionsFilePath", () => {
  it("allows instructions inside cwd", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-instructions-allowed-"));
    const cwd = path.join(root, "repo");
    const instructionsPath = path.join(cwd, "AGENTS.md");
    await fs.mkdir(cwd, { recursive: true });

    try {
      const result = resolveAllowedInstructionsFilePath({
        cwd,
        instructionsFilePath: instructionsPath,
      });

      expect(result.resolvedInstructionsFilePath).toBe(instructionsPath);
      expect(result.effectiveInstructionsFilePath).toBe(instructionsPath);
      expect(result.warning).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("blocks arbitrary instructions outside cwd", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-instructions-blocked-"));
    const cwd = path.join(root, "repo");
    const outside = path.join(root, "outside", "AGENTS.md");
    await fs.mkdir(cwd, { recursive: true });

    try {
      const result = resolveAllowedInstructionsFilePath({
        cwd,
        instructionsFilePath: outside,
      });

      expect(result.resolvedInstructionsFilePath).toBe(outside);
      expect(result.effectiveInstructionsFilePath).toBe("");
      expect(result.warning).toContain('must stay within cwd');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("allows Paperclip-managed instructions outside cwd when inside the managed root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-managed-instructions-"));
    const cwd = path.join(root, "repo");
    const managedRoot = path.join(root, "paperclip", "agent", "instructions");
    const managedFile = path.join(managedRoot, "AGENTS.md");
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(managedRoot, { recursive: true });

    try {
      const result = resolveAllowedInstructionsFilePath({
        cwd,
        instructionsFilePath: managedFile,
        instructionsBundleMode: "managed",
        instructionsRootPath: managedRoot,
      });

      expect(result.resolvedInstructionsFilePath).toBe(managedFile);
      expect(result.effectiveInstructionsFilePath).toBe(managedFile);
      expect(result.warning).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("renderPaperclipWakePrompt", () => {
  it("tells agents to rely on inline wake context when fallback fetch is not needed", () => {
    const prompt = renderPaperclipWakePrompt({
      reason: "issue_assigned",
      issue: {
        id: "issue-1",
        identifier: "P4Y-1",
        title: "Repository baseline",
        status: "in_review",
      },
      checkedOutByHarness: true,
      commentIds: [],
      comments: [],
      commentWindow: {
        requestedCount: 0,
        includedCount: 0,
        missingCount: 0,
      },
      truncated: false,
      fallbackFetchNeeded: false,
    });

    expect(prompt).toContain(
      "Do not call `/api/issues/{id}/heartbeat-context` when `fallbackFetchNeeded` is false; use this inline wake payload as the source of truth for the current wake.",
    );
    expect(prompt).toContain(
      "Do not call `/api/issues/{id}/checkout` again unless you intentionally switch to a different task.",
    );
    expect(prompt).toContain(
      "Do not use raw `curl` control-plane probes for routine confirmation when this wake payload already gives you the current issue state.",
    );
  });

  it("renders the truth ledger for issue-scoped review wakes", () => {
    const prompt = renderPaperclipWakePrompt(
      {
        reason: "issue_comment_mentioned",
        issue: {
          id: "issue-1",
          identifier: "BBB-1",
          title: "Baseline review",
          status: "in_progress",
        },
        checkedOutByHarness: true,
        commentIds: [],
        comments: [],
        commentWindow: {
          requestedCount: 0,
          includedCount: 0,
          missingCount: 0,
        },
        truncated: false,
        fallbackFetchNeeded: false,
      },
      {
        truthLedger: {
          scope: "repository_baseline_review",
          authoritativeSources: [
            "wake_payload",
            "managed_instructions",
            "project_packet",
            "paperclip_api_mutations",
            "runtime_reconciliation",
          ],
          issueCommentRequired: true,
          finalSummaryMayBecomeIssueComment: true,
          localShellProbesAreAuxiliary: true,
          apiRootIsNotOperationalProof: true,
        },
      },
    );

    expect(prompt).toContain("## Paperclip Truth Ledger");
    expect(prompt).toContain("- scope: repository baseline review");
    expect(prompt).toContain("wake_payload > managed_instructions > project_packet");
    expect(prompt).toContain("your final summary may be persisted by Paperclip as the issue-thread update for this run");
    expect(prompt).toContain("do not treat the bare `PAPERCLIP_API_URL` root as an operational proof probe");
    expect(prompt).toContain("direct Paperclip API reads and mutations are disabled for this wake");
    expect(prompt).toContain("even when `fallbackFetchNeeded` is yes");
  });

  it("marks CEO repository baseline reviews as direct-API-disabled", () => {
    expect(
      shouldDisableDirectPaperclipApiForRun({
        truthLedger: { scope: "repository_baseline_review" },
      }),
    ).toBe(true);
    expect(
      shouldDisableDirectPaperclipApiForRun({
        truthLedger: { scope: "issue_scoped" },
      }),
    ).toBe(false);

    const env = applyDirectPaperclipApiPolicy(
      {
        PAPERCLIP_API_URL: "http://localhost:3101",
        PAPERCLIP_API_BASE: "http://localhost:3101/api",
        PAPERCLIP_API_KEY: "run-jwt-token",
      },
      { disableDirectApi: true },
    );
    expect(env.PAPERCLIP_DIRECT_API_DISABLED).toBe("true");
    expect(env.PAPERCLIP_API_KEY).toBeUndefined();
  });
});
