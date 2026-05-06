import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareEffectiveCodexHome, prepareManagedCodexHome } from "./codex-home.js";

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

describe("prepareManagedCodexHome auth.json handling", () => {
  function buildEnv(root: string, sharedHome: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      PAPERCLIP_HOME: root,
      PAPERCLIP_INSTANCE_ID: "dev",
      CODEX_HOME: sharedHome,
      ...overrides,
    };
  }

  function managedAuthPath(root: string) {
    return path.join(root, "instances", "dev", "companies", "company-1", "codex-home", "auth.json");
  }

  it("symlinks shared auth.json so managed Codex home follows local-login token rotation", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    await fs.mkdir(sharedHome, { recursive: true });
    await fs.writeFile(path.join(sharedHome, "auth.json"), '{"token":"rotation-1"}', "utf8");

    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1");

    const target = managedAuthPath(root);
    expect((await fs.lstat(target)).isSymbolicLink()).toBe(true);

    await fs.writeFile(path.join(sharedHome, "auth.json"), '{"token":"rotation-2"}', "utf8");
    expect(await fs.readFile(target, "utf8")).toBe('{"token":"rotation-2"}');
  });

  it("replaces a stale regular auth.json copy with a symlink when no API key is configured", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    const target = managedAuthPath(root);
    await fs.mkdir(sharedHome, { recursive: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(path.join(sharedHome, "auth.json"), '{"token":"fresh"}', "utf8");
    await fs.writeFile(target, '{"token":"stale-copy"}', "utf8");

    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1");

    expect((await fs.lstat(target)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(target, "utf8")).toBe('{"token":"fresh"}');
  });

  it("writes API-key auth.json into the managed home and replaces a local-login symlink", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    await fs.mkdir(sharedHome, { recursive: true });
    await fs.writeFile(path.join(sharedHome, "auth.json"), '{"token":"chatgpt"}', "utf8");

    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1");
    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1", {
      apiKey: "sk-test",
    });

    const target = managedAuthPath(root);
    expect((await fs.lstat(target)).isSymbolicLink()).toBe(false);
    expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ OPENAI_API_KEY: "sk-test" });
    expect(await fs.readFile(path.join(sharedHome, "auth.json"), "utf8")).toBe('{"token":"chatgpt"}');
  });

  it("restores the shared local-login symlink after API-key mode is removed", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    await fs.mkdir(sharedHome, { recursive: true });
    await fs.writeFile(path.join(sharedHome, "auth.json"), '{"token":"chatgpt"}', "utf8");

    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1", {
      apiKey: "sk-test",
    });
    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1");

    const target = managedAuthPath(root);
    expect((await fs.lstat(target)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(target, "utf8")).toBe('{"token":"chatgpt"}');
  });

  it("removes a prior managed API-key auth.json when API-key mode is removed without shared auth", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    await fs.mkdir(sharedHome, { recursive: true });

    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1", {
      apiKey: "sk-test",
    });
    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1");

    await expect(fs.lstat(managedAuthPath(root))).rejects.toThrow();
  });

  it("does not remove an auth.json directory when restoring local-login symlink mode", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    const target = managedAuthPath(root);
    await fs.mkdir(sharedHome, { recursive: true });
    await fs.writeFile(path.join(sharedHome, "auth.json"), '{"token":"chatgpt"}', "utf8");
    await fs.mkdir(target, { recursive: true });

    await prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1");

    expect((await fs.lstat(target)).isDirectory()).toBe(true);
  });

  it("refuses to overwrite an auth.json directory in API-key mode", async () => {
    const root = await makeTmpRoot();
    const sharedHome = path.join(root, "shared-codex-home");
    const target = managedAuthPath(root);
    await fs.mkdir(sharedHome, { recursive: true });
    await fs.mkdir(target, { recursive: true });

    await expect(
      prepareManagedCodexHome(buildEnv(root, sharedHome), async () => {}, "company-1", {
        apiKey: "sk-test",
      }),
    ).rejects.toThrow(/auth\.json.*directory/);
    expect((await fs.lstat(target)).isDirectory()).toBe(true);
  });
});
