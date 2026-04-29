import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "@paperclipai/adapter-pi-local/server";

async function writeFakePiCommand(commandPath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
if (process.argv.includes("--list-models")) {
  console.log("provider  model");
  console.log("google    gemini-3-flash-preview");
  process.exit(0);
}
if (process.env.PAPERCLIP_TEST_CAPTURE_PATH) {
  fs.writeFileSync(process.env.PAPERCLIP_TEST_CAPTURE_PATH, JSON.stringify({
    path: process.env.PATH || "",
  }), "utf8");
}
console.log(JSON.stringify({ type: "agent_start" }));
console.log(JSON.stringify({ type: "turn_start" }));
console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: "" }, toolResults: [] }));
console.log(JSON.stringify({ type: "agent_end", messages: [] }));
console.log(JSON.stringify({
  type: "auto_retry_end",
  success: false,
  attempt: 3,
  finalError: "Cloud Code Assist API error (429): RESOURCE_EXHAUSTED"
}));
process.exit(0);
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

async function writeSkill(root: string, name: string) {
  const skillDir = path.join(root, name);
  await fs.mkdir(path.join(skillDir, "bin"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `# ${name}\n`, "utf8");
  await fs.writeFile(path.join(skillDir, "bin", `${name}-tool`), "#!/bin/sh\n", "utf8");
  return skillDir;
}

describe("pi_local execute", () => {
  it("fails the run when Pi exhausts automatic retries despite exiting 0", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-pi-execute-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "pi");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakePiCommand(commandPath);

    const previousHome = process.env.HOME;
    process.env.HOME = root;

    try {
      const result = await execute({
        runId: "run-pi-quota-exhausted",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Pi Agent",
          adapterType: "pi_local",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        config: {
          command: commandPath,
          cwd: workspace,
          model: "google/gemini-3-flash-preview",
          promptTemplate: "Keep working.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(1);
      expect(result.errorMessage).toContain("RESOURCE_EXHAUSTED");
      await expect(fs.readdir(path.join(root, ".pi", "paperclips"))).resolves.toHaveLength(1);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("prepends desired Pi skill bin directories to PATH without duplicates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-pi-skill-path-"));
    const workspace = path.join(root, "workspace");
    const skillsRoot = path.join(root, "skills");
    const commandPath = path.join(root, "pi");
    const capturePath = path.join(root, "capture.json");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakePiCommand(commandPath);
    const desiredSkillDir = await writeSkill(skillsRoot, "paperclip");
    const desiredBin = path.join(desiredSkillDir, "bin");

    const previousHome = process.env.HOME;
    const previousCapturePath = process.env.PAPERCLIP_TEST_CAPTURE_PATH;
    process.env.HOME = root;
    process.env.PAPERCLIP_TEST_CAPTURE_PATH = capturePath;
    let metaPath: string | undefined;

    try {
      await execute({
        runId: "run-pi-skill-path",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Pi Agent",
          adapterType: "pi_local",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        config: {
          command: commandPath,
          cwd: workspace,
          model: "google/gemini-3-flash-preview",
          promptTemplate: "Keep working.",
          paperclipRuntimeSkills: [
            {
              key: "paperclipai/paperclip/paperclip",
              runtimeName: "paperclip",
              source: desiredSkillDir,
              required: true,
            },
          ],
          env: {
            PATH: "/usr/bin",
          },
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
        onMeta: async (meta) => {
          metaPath = meta.env.PATH;
        },
      });

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as { path: string };
      const parts = capture.path.split(path.delimiter);
      const metaParts = metaPath?.split(path.delimiter) ?? [];
      expect(parts[0]).toBe(desiredBin);
      expect(parts.filter((entry) => entry === desiredBin)).toHaveLength(1);
      expect(metaParts[0]).toBe(desiredBin);
      expect(metaParts.filter((entry) => entry === desiredBin)).toHaveLength(1);
      expect(metaPath).toBe(capture.path);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCapturePath === undefined) delete process.env.PAPERCLIP_TEST_CAPTURE_PATH;
      else process.env.PAPERCLIP_TEST_CAPTURE_PATH = previousCapturePath;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not expose non-desired Pi skill bin directories on PATH", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-pi-skill-path-filter-"));
    const workspace = path.join(root, "workspace");
    const skillsRoot = path.join(root, "skills");
    const commandPath = path.join(root, "pi");
    const capturePath = path.join(root, "capture.json");
    await fs.mkdir(workspace, { recursive: true });
    await writeFakePiCommand(commandPath);
    const desiredSkillDir = await writeSkill(skillsRoot, "paperclip");
    const extraSkillDir = await writeSkill(skillsRoot, "extra");
    const extraBin = path.join(extraSkillDir, "bin");

    const previousHome = process.env.HOME;
    const previousCapturePath = process.env.PAPERCLIP_TEST_CAPTURE_PATH;
    process.env.HOME = root;
    process.env.PAPERCLIP_TEST_CAPTURE_PATH = capturePath;

    try {
      await execute({
        runId: "run-pi-skill-path-filter",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Pi Agent",
          adapterType: "pi_local",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        config: {
          command: commandPath,
          cwd: workspace,
          model: "google/gemini-3-flash-preview",
          promptTemplate: "Keep working.",
          paperclipRuntimeSkills: [
            {
              key: "paperclipai/paperclip/paperclip",
              runtimeName: "paperclip",
              source: desiredSkillDir,
              required: true,
            },
            {
              key: "paperclipai/paperclip/extra",
              runtimeName: "extra",
              source: extraSkillDir,
              required: false,
            },
          ],
          paperclipSkillSync: {
            desiredSkills: ["paperclip"],
          },
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as { path: string };
      expect(capture.path.split(path.delimiter)).not.toContain(extraBin);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCapturePath === undefined) delete process.env.PAPERCLIP_TEST_CAPTURE_PATH;
      else process.env.PAPERCLIP_TEST_CAPTURE_PATH = previousCapturePath;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
