import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import type { RunProcessResult } from "@paperclipai/adapter-utils/server-utils";
import {
  applyDirectPaperclipApiPolicy,
  applyPaperclipWorkspaceEnv,
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  parseObject,
  resolvePaperclipWorkspaceBranch,
  runChildProcess,
  shouldDisableDirectPaperclipApiForRun,
  stringifyPaperclipWakePayload,
} from "@paperclipai/adapter-utils/server-utils";
import { prepareEffectiveCodexHome } from "./codex-home.js";

export interface CodexLoginResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  loginUrl: string | null;
}

function buildLoginResult(input: {
  proc: RunProcessResult;
  loginUrl: string | null;
}): CodexLoginResult {
  return {
    exitCode: input.proc.exitCode,
    signal: input.proc.signal,
    timedOut: input.proc.timedOut,
    stdout: input.proc.stdout,
    stderr: input.proc.stderr,
    loginUrl: input.loginUrl,
  };
}

export function buildCodexLoginArgs(config: Record<string, unknown>): string[] {
  const loginArgs = asStringArray(config.loginArgs);
  if (loginArgs.length > 0) return loginArgs;

  const legacyArgs = asStringArray(config.authArgs);
  if (legacyArgs.length > 0) return legacyArgs;

  if (config.deviceAuth === false || config.loginDeviceAuth === false) {
    return ["login"];
  }

  return ["login", "--device-auth"];
}

export function extractCodexLoginUrl(text: string): string | null {
  const urls = text.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? [];
  const cleaned = urls
    .map((url) => url.replace(/[),.;\]]+$/g, ""))
    .filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });
  return (
    cleaned.find((url) => /(?:openai|chatgpt)\.com/i.test(url)) ??
    cleaned[0] ??
    null
  );
}

export async function runCodexLogin(input: {
  runId: string;
  agent: AdapterExecutionContext["agent"];
  config: Record<string, unknown>;
  context?: Record<string, unknown>;
  authToken?: string;
  onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}) {
  const onLog = input.onLog ?? (async () => {});
  const config = input.config;
  const context = input.context ?? {};
  const command = asString(config.command, "codex");
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const workspaceStrategy = asString(workspaceContext.strategy, "");
  const workspaceId = asString(workspaceContext.workspaceId, "");
  const workspaceRepoUrl = asString(workspaceContext.repoUrl, "");
  const workspaceRepoRef = asString(workspaceContext.repoRef, "");
  const workspaceBranch = resolvePaperclipWorkspaceBranch(workspaceContext);
  const workspaceWorktreePath = asString(workspaceContext.worktreePath, "");
  const agentHome = asString(workspaceContext.agentHome, "");
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const envConfig = parseObject(config.env);
  const effectiveCodexHome = await prepareEffectiveCodexHome(process.env, envConfig, onLog, input.agent.companyId);
  const hasExplicitApiKey =
    typeof envConfig.PAPERCLIP_API_KEY === "string" && envConfig.PAPERCLIP_API_KEY.trim().length > 0;
  const env: Record<string, string> = { ...buildPaperclipEnv(input.agent) };
  env.CODEX_HOME = effectiveCodexHome;
  env.PAPERCLIP_RUN_ID = input.runId;

  const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);
  applyPaperclipWorkspaceEnv(env, {
    workspaceCwd: effectiveWorkspaceCwd,
    workspaceSource,
    workspaceStrategy,
    workspaceId,
    workspaceRepoUrl,
    workspaceRepoRef,
    workspaceBranch,
    workspaceWorktreePath,
    agentHome,
  });
  if (wakePayloadJson) {
    env.PAPERCLIP_WAKE_PAYLOAD_JSON = wakePayloadJson;
  }

  for (const [key, value] of Object.entries(envConfig)) {
    if (key === "CODEX_HOME") continue;
    if (typeof value === "string") env[key] = value;
  }

  const disableDirectPaperclipApi = shouldDisableDirectPaperclipApiForRun({
    truthLedger: context.paperclipTruthLedger,
  });
  if (!disableDirectPaperclipApi && !hasExplicitApiKey && input.authToken) {
    env.PAPERCLIP_API_KEY = input.authToken;
  }

  const policyAdjustedEnv = applyDirectPaperclipApiPolicy(env, {
    disableDirectApi: disableDirectPaperclipApi,
  });
  if (disableDirectPaperclipApi) {
    delete policyAdjustedEnv.PAPERCLIP_API_KEY;
  }

  const runtimeEnv = ensurePathInEnv({ ...process.env, ...policyAdjustedEnv });
  await ensureCommandResolvable(command, cwd, runtimeEnv);

  const proc = await runChildProcess(input.runId, command, buildCodexLoginArgs(config), {
    cwd,
    env: policyAdjustedEnv,
    timeoutSec: asNumber(config.loginTimeoutSec, asNumber(config.timeoutSec, 300)),
    graceSec: asNumber(config.graceSec, 20),
    onLog,
  });

  return buildLoginResult({
    proc,
    loginUrl: extractCodexLoginUrl([proc.stdout, proc.stderr].join("\n")),
  });
}
