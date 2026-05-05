import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareEffectiveCodexHome } from "./codex-home.js";

const tmpRoots: string[] = [];

async function makeTmpRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-codex-home-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("prepareEffectiveCodexHome", () => {
  it("uses a company-scoped managed Codex home by default", async () => {
    const root = await makeTmpRoot();
    const logs: string[] = [];
    const result = await prepareEffectiveCodexHome(
      {
        PAPERCLIP_HOME: root,
        PAPERCLIP_INSTANCE_ID: "dev",
      },
      {},
      async (_stream, chunk) => {
        logs.push(chunk);
      },
      "company-1",
    );

    expect(result).toBe(path.join(root, "instances", "dev", "companies", "company-1", "codex-home"));
    expect((await fs.stat(result)).isDirectory()).toBe(true);
    expect(logs.join("")).toContain("Paperclip-managed");
  });

  it("honors an explicit adapter CODEX_HOME override", async () => {
    const root = await makeTmpRoot();
    const explicitHome = path.join(root, "custom-codex-home");
    const logs: string[] = [];
    const result = await prepareEffectiveCodexHome(
      {
        PAPERCLIP_HOME: root,
      },
      {
        CODEX_HOME: explicitHome,
      },
      async (_stream, chunk) => {
        logs.push(chunk);
      },
      "company-1",
    );

    expect(result).toBe(explicitHome);
    expect((await fs.stat(explicitHome)).isDirectory()).toBe(true);
    expect(logs).toEqual([]);
  });
});
