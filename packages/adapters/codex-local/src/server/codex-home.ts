import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";

const TRUTHY_ENV_RE = /^(1|true|yes|on)$/i;
const COPIED_SHARED_FILES = ["config.json", "instructions.md"] as const;
const SYMLINKED_SHARED_FILES = ["auth.json"] as const;
const DEFAULT_PAPERCLIP_INSTANCE_ID = "default";
const CODEX_HOME_ROOT_ENV = "PAPERCLIP_CODEX_HOME_ROOT";

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function pathExists(candidate: string): Promise<boolean> {
  return fs.access(candidate).then(() => true).catch(() => false);
}

export function resolveSharedCodexHomeDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = nonEmpty(env.CODEX_HOME);
  return fromEnv ? path.resolve(fromEnv) : path.join(os.homedir(), ".codex");
}

function isWorktreeMode(env: NodeJS.ProcessEnv): boolean {
  return TRUTHY_ENV_RE.test(env.PAPERCLIP_IN_WORKTREE ?? "");
}

export function resolveManagedCodexHomeDir(
  env: NodeJS.ProcessEnv,
  companyId?: string,
): string {
  const paperclipHome = nonEmpty(env.PAPERCLIP_HOME) ?? path.resolve(os.homedir(), ".paperclip");
  const managedCodexHomeRoot = nonEmpty(env[CODEX_HOME_ROOT_ENV]);
  const root = managedCodexHomeRoot ? path.resolve(managedCodexHomeRoot) : paperclipHome;
  const instanceId = nonEmpty(env.PAPERCLIP_INSTANCE_ID) ?? DEFAULT_PAPERCLIP_INSTANCE_ID;
  return companyId
    ? path.resolve(root, "instances", instanceId, "companies", companyId, "codex-home")
    : path.resolve(root, "instances", instanceId, "codex-home");
}

async function ensureParentDir(target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
}

async function ensureSymlink(target: string, source: string): Promise<void> {
  const existing = await fs.lstat(target).catch(() => null);
  if (!existing) {
    await ensureParentDir(target);
    await fs.symlink(source, target);
    return;
  }

  if (!existing.isSymbolicLink()) {
    return;
  }

  const linkedPath = await fs.readlink(target).catch(() => null);
  if (!linkedPath) return;

  const resolvedLinkedPath = path.resolve(path.dirname(target), linkedPath);
  if (resolvedLinkedPath === source) return;

  await fs.unlink(target);
  await fs.symlink(source, target);
}

async function ensureCopiedFile(target: string, source: string): Promise<void> {
  const existing = await fs.lstat(target).catch(() => null);
  if (existing) return;
  await ensureParentDir(target);
  await fs.copyFile(source, target);
}

async function removeManagedCodexHomeContamination(
  targetHome: string,
  onLog: AdapterExecutionContext["onLog"],
): Promise<void> {
  const staleConfigToml = path.join(targetHome, "config.toml");
  const stalePluginsDir = path.join(targetHome, ".tmp", "plugins");
  const stalePluginsSha = path.join(targetHome, ".tmp", "plugins.sha");
  const staleRemotePluginSyncMarker = path.join(targetHome, ".tmp", "app-server-remote-plugin-sync-v1");

  const removed: string[] = [];
  if (await pathExists(staleConfigToml)) {
    await fs.rm(staleConfigToml, { force: true });
    removed.push("config.toml");
  }
  if (await pathExists(stalePluginsDir)) {
    await fs.rm(stalePluginsDir, { recursive: true, force: true });
    removed.push(".tmp/plugins");
  }
  if (await pathExists(stalePluginsSha)) {
    await fs.rm(stalePluginsSha, { force: true });
    removed.push(".tmp/plugins.sha");
  }
  if (await pathExists(staleRemotePluginSyncMarker)) {
    await fs.rm(staleRemotePluginSyncMarker, { force: true });
    removed.push(".tmp/app-server-remote-plugin-sync-v1");
  }

  if (removed.length > 0) {
    await onLog(
      "stdout",
      `[paperclip] Removed incompatible shared Codex bootstrap artifacts from managed home: ${removed.join(", ")}\n`,
    );
  }
}

export async function prepareManagedCodexHome(
  env: NodeJS.ProcessEnv,
  onLog: AdapterExecutionContext["onLog"],
  companyId?: string,
): Promise<string> {
  const targetHome = resolveManagedCodexHomeDir(env, companyId);

  const sourceHome = resolveSharedCodexHomeDir(env);
  if (path.resolve(sourceHome) === path.resolve(targetHome)) return targetHome;

  await fs.mkdir(targetHome, { recursive: true });

  for (const name of SYMLINKED_SHARED_FILES) {
    const source = path.join(sourceHome, name);
    if (!(await pathExists(source))) continue;
    await ensureSymlink(path.join(targetHome, name), source);
  }

  for (const name of COPIED_SHARED_FILES) {
    const source = path.join(sourceHome, name);
    if (!(await pathExists(source))) continue;
    await ensureCopiedFile(path.join(targetHome, name), source);
  }

  await removeManagedCodexHomeContamination(targetHome, onLog);

  await onLog(
    "stdout",
    `[paperclip] Using ${isWorktreeMode(env) ? "worktree-isolated" : "Paperclip-managed"} Codex home "${targetHome}" (seeded from "${sourceHome}").\n`,
  );
  return targetHome;
}
