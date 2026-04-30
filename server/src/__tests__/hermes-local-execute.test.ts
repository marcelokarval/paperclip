import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function createFakeHermesCli(dir: string, argsOutputPath: string) {
  const cliPath = path.join(dir, "fake-hermes.mjs");
  await fs.writeFile(
    cliPath,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      `const outputPath = ${JSON.stringify(argsOutputPath)};`,
      "fs.writeFileSync(outputPath, JSON.stringify(process.argv.slice(2)), 'utf8');",
      "process.stdout.write('All done.\\nsession_id: sess-123\\n');",
    ].join("\n"),
    "utf8",
  );
  await fs.chmod(cliPath, 0o755);
  return cliPath;
}

async function createRetryingFakeHermesCli(dir: string, attemptsOutputPath: string) {
  const cliPath = path.join(dir, "fake-hermes-retry.mjs");
  await fs.writeFile(
    cliPath,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      `const outputPath = ${JSON.stringify(attemptsOutputPath)};`,
      "const args = process.argv.slice(2);",
      "fs.appendFileSync(outputPath, `${JSON.stringify(args)}\\n`, 'utf8');",
      "if (args.includes('--resume')) {",
      "  process.stderr.write('Error: unknown session id stale-session\\n');",
      "  process.exit(1);",
      "}",
      "process.stdout.write('Recovered with fresh session.\\nsession_id: sess-fresh\\n');",
    ].join("\n"),
    "utf8",
  );
  await fs.chmod(cliPath, 0o755);
  return cliPath;
}

describe("hermes-paperclip-adapter execute", () => {
  it("prepends instructionsFilePath contents to the Hermes prompt", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hermes-workspace-"));
    const instructionsPath = path.join(workspace, "AGENTS.md");
    const hermesArgsPath = path.join(workspace, "hermes-args.json");
    const hermesCommand = await createFakeHermesCli(workspace, hermesArgsPath);
    await fs.writeFile(instructionsPath, "# Agent Rules\nUse HEARTBEAT.md for wake-specific policy.\n", "utf8");

    const { execute } = await import("hermes-paperclip-adapter/server");
    const logChunks: string[] = [];

    await execute({
      runId: "run-1",
      agent: {
        id: "agent-1",
        name: "Hermes QA",
        companyId: "company-1",
        adapterConfig: {
          cwd: workspace,
          hermesCommand,
          instructionsFilePath: instructionsPath,
        },
      },
      runtime: {},
      config: {},
      context: {},
      onLog: async (_stream, chunk) => {
        logChunks.push(chunk);
      },
    } as never);

    const args = JSON.parse(await fs.readFile(hermesArgsPath, "utf8")) as string[];
    expect(args[0]).toBe("chat");
    expect(args[1]).toBe("-Q");
    expect(args[2]).toBe("--source");
    expect(args[3]).toBe("tool");
    expect(args[4]).toBe("-q");
    const prompt = args[5];
    expect(prompt).toContain("# Agent Rules");
    expect(prompt).toContain(
      `The above agent instructions were loaded from ${instructionsPath}. Resolve any relative file references from ${workspace}/.`,
    );
    expect(prompt).toContain('You are "Hermes QA", an AI agent employee in a Paperclip-managed company.');
    expect(logChunks.join("")).not.toContain("could not read agent instructions file");
  });

  it("warns and continues when instructionsFilePath cannot be read", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hermes-missing-"));
    const hermesArgsPath = path.join(workspace, "hermes-args.json");
    const hermesCommand = await createFakeHermesCli(workspace, hermesArgsPath);
    const missingInstructionsPath = path.join(workspace, "AGENTS.md");
    const { execute } = await import("hermes-paperclip-adapter/server");
    const logChunks: string[] = [];

    await execute({
      runId: "run-2",
      agent: {
        id: "agent-2",
        name: "Hermes Missing",
        companyId: "company-2",
        adapterConfig: {
          cwd: workspace,
          hermesCommand,
          instructionsFilePath: missingInstructionsPath,
        },
      },
      runtime: {},
      config: {},
      context: {},
      onLog: async (_stream, chunk) => {
        logChunks.push(chunk);
      },
    } as never);

    const args = JSON.parse(await fs.readFile(hermesArgsPath, "utf8")) as string[];
    const prompt = args[5];
    expect(prompt).not.toContain("The above agent instructions were loaded from");
    expect(logChunks.join("")).toContain(`could not read agent instructions file "${missingInstructionsPath}"`);
  });

  it("retries with a fresh session when Hermes rejects the persisted session", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hermes-retry-"));
    const attemptsPath = path.join(workspace, "hermes-attempts.jsonl");
    const hermesCommand = await createRetryingFakeHermesCli(workspace, attemptsPath);
    const { execute } = await import("hermes-paperclip-adapter/server");
    const logChunks: string[] = [];

    const result = await execute({
      runId: "run-3",
      agent: {
        id: "agent-3",
        name: "Hermes Retry",
        companyId: "company-3",
        adapterConfig: {
          cwd: workspace,
          hermesCommand,
        },
      },
      runtime: {
        sessionParams: {
          sessionId: "stale-session",
        },
      },
      config: {},
      context: {},
      onLog: async (_stream, chunk) => {
        logChunks.push(chunk);
      },
    } as never);

    const attempts = (await fs.readFile(attemptsPath, "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as string[]);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toContain("--resume");
    expect(attempts[0]).toContain("stale-session");
    expect(attempts[1]).not.toContain("--resume");
    expect(result.exitCode).toBe(0);
    expect(result.sessionParams).toEqual({ sessionId: "sess-fresh" });
    expect(logChunks.join("")).toContain(
      'Hermes resume session "stale-session" is unavailable; retrying with a fresh session.',
    );
  });
});
