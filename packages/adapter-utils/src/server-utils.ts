import { spawn, type ChildProcess } from "node:child_process";
import { constants as fsConstants, promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import type {
  AdapterSkillEntry,
  AdapterSkillSnapshot,
} from "./types.js";

export interface RunProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  pid: number | null;
  startedAt: string | null;
}

interface RunningProcess {
  child: ChildProcess;
  graceSec: number;
  processGroupId: number | null;
}

interface SpawnTarget {
  command: string;
  args: string[];
}

type ChildProcessWithEvents = ChildProcess & {
  on(event: "error", listener: (err: Error) => void): ChildProcess;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): ChildProcess;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): ChildProcess;
};

export interface TerminalResultCleanupOptions {
  graceMs: number;
  hasTerminalResult(output: string): boolean;
}

function resolveProcessGroupId(child: ChildProcess) {
  if (process.platform === "win32") return null;
  return typeof child.pid === "number" && child.pid > 0 ? child.pid : null;
}

function signalRunningProcess(
  running: Pick<RunningProcess, "child" | "processGroupId">,
  signal: NodeJS.Signals,
) {
  if (process.platform !== "win32" && running.processGroupId && running.processGroupId > 0) {
    try {
      process.kill(-running.processGroupId, signal);
      return;
    } catch {
      // Fall back to the direct child signal if group signaling fails.
    }
  }
  if (!running.child.killed) {
    running.child.kill(signal);
  }
}

export const runningProcesses = new Map<string, RunningProcess>();
export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
export const MAX_EXCERPT_BYTES = 32 * 1024;
const MAX_TERMINAL_RESULT_SCAN_BYTES = 64 * 1024;
const SENSITIVE_ENV_KEY = /(key|token|secret|password|passwd|authorization|cookie)/i;
const SENSITIVE_ENV_EXACT_KEYS = new Set(["PAPERCLIP_WAKE_PAYLOAD_JSON"]);
const PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES = [
  "../../skills",
  "../../../../../skills",
];

export interface PaperclipSkillEntry {
  key: string;
  runtimeName: string;
  source: string;
  required?: boolean;
  requiredReason?: string | null;
}

export interface InstalledSkillTarget {
  targetPath: string | null;
  kind: "symlink" | "directory" | "file";
}

type PaperclipTruthLedger = {
  scope: "repository_baseline_review" | "issue_scoped" | null;
  authoritativeSources: string[];
  issueCommentRequired: boolean;
  finalSummaryMayBecomeIssueComment: boolean;
  localShellProbesAreAuxiliary: boolean;
  apiRootIsNotOperationalProof: boolean;
};

interface PersistentSkillSnapshotOptions {
  adapterType: string;
  availableEntries: PaperclipSkillEntry[];
  desiredSkills: string[];
  installed: Map<string, InstalledSkillTarget>;
  skillsHome: string;
  locationLabel?: string | null;
  installedDetail?: string | null;
  missingDetail: string;
  externalConflictDetail: string;
  externalDetail: string;
  warnings?: string[];
}

function normalizePathSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function isMaintainerOnlySkillTarget(candidate: string): boolean {
  return normalizePathSlashes(candidate).includes("/.agents/skills/");
}

function skillLocationLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildManagedSkillOrigin(entry: { required?: boolean }): Pick<
  AdapterSkillEntry,
  "origin" | "originLabel" | "readOnly"
> {
  if (entry.required) {
    return {
      origin: "paperclip_required",
      originLabel: "Required by Paperclip",
      readOnly: false,
    };
  }
  return {
    origin: "company_managed",
    originLabel: "Managed by Paperclip",
    readOnly: false,
  };
}

function resolveInstalledEntryTarget(
  skillsHome: string,
  entryName: string,
  dirent: Dirent,
  linkedPath: string | null,
): InstalledSkillTarget {
  const fullPath = path.join(skillsHome, entryName);
  if (dirent.isSymbolicLink()) {
    return {
      targetPath: linkedPath ? path.resolve(path.dirname(fullPath), linkedPath) : null,
      kind: "symlink",
    };
  }
  if (dirent.isDirectory()) {
    return { targetPath: fullPath, kind: "directory" };
  }
  return { targetPath: fullPath, kind: "file" };
}

export function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function parseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function appendWithCap(prev: string, chunk: string, cap = MAX_CAPTURE_BYTES) {
  const combined = prev + chunk;
  return combined.length > cap ? combined.slice(combined.length - cap) : combined;
}

export function resolvePathValue(obj: Record<string, unknown>, dottedPath: string) {
  const parts = dottedPath.split(".");
  let cursor: unknown = obj;

  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
      return "";
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }

  if (cursor === null || cursor === undefined) return "";
  if (typeof cursor === "string") return cursor;
  if (typeof cursor === "number" || typeof cursor === "boolean") return String(cursor);

  try {
    return JSON.stringify(cursor);
  } catch {
    return "";
  }
}

export function renderTemplate(template: string, data: Record<string, unknown>) {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, path) => resolvePathValue(data, path));
}

export function joinPromptSections(
  sections: Array<string | null | undefined>,
  separator = "\n\n",
) {
  return sections
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(separator);
}

export async function buildInstructionsPromptPrefix(input: {
  instructionsFilePath: string;
  supplementalFileNames?: string[];
}): Promise<{
  prefix: string;
  includedSupplementalPaths: string[];
}> {
  const instructionsFilePath = input.instructionsFilePath.trim();
  if (!instructionsFilePath) {
    return { prefix: "", includedSupplementalPaths: [] };
  }

  const instructionsDirPath = path.dirname(instructionsFilePath);
  const instructionsDir = `${instructionsDirPath}/`;
  const baseContents = await fs.readFile(instructionsFilePath, "utf8");

  const supplementalSections: string[] = [];
  const includedSupplementalPaths: string[] = [];
  for (const fileName of input.supplementalFileNames ?? []) {
    const trimmed = fileName.trim();
    if (!trimmed) continue;
    const supplementalPath = path.join(instructionsDirPath, trimmed);
    if (supplementalPath === instructionsFilePath) continue;
    try {
      const stat = await fs.stat(supplementalPath);
      if (!stat.isFile()) continue;
      const supplementalContents = await fs.readFile(supplementalPath, "utf8");
      supplementalSections.push(
        `## Supplemental instructions from ./${trimmed}\n${supplementalContents}`,
      );
      includedSupplementalPaths.push(`./${trimmed}`);
    } catch {
      continue;
    }
  }

  const loadedFilesSentence =
    includedSupplementalPaths.length > 0
      ? ` Supplemental sibling instruction files were also loaded from ${includedSupplementalPaths.join(", ")}.`
      : "";

  return {
    prefix: [
      baseContents,
      ...supplementalSections,
      `The above agent instructions were loaded from ${instructionsFilePath}. ` +
        `Resolve any relative file references from ${instructionsDir}.` +
        loadedFilesSentence,
      "",
    ].join("\n\n"),
    includedSupplementalPaths,
  };
}

export function buildInstructionSupplementalEnv(input: {
  effectiveInstructionsFilePath: string;
  includedSupplementalPaths: string[];
}): Record<string, string> {
  const effectiveInstructionsFilePath = input.effectiveInstructionsFilePath.trim();
  if (!effectiveInstructionsFilePath) return {};

  const env: Record<string, string> = {
    PAPERCLIP_INSTRUCTIONS_FILE_PATH: effectiveInstructionsFilePath,
  };
  const projectPacketIncluded = input.includedSupplementalPaths.includes("./PROJECT_PACKET.md");
  env.PAPERCLIP_PROJECT_PACKET_PRESENT = projectPacketIncluded ? "true" : "false";
  if (projectPacketIncluded) {
    env.PAPERCLIP_PROJECT_PACKET_PATH = path.join(
      path.dirname(effectiveInstructionsFilePath),
      "PROJECT_PACKET.md",
    );
  }
  return env;
}

export function shouldDisableDirectPaperclipApiForRun(input: {
  truthLedger?: unknown;
}): boolean {
  const truthLedger = normalizePaperclipTruthLedger(input.truthLedger);
  return truthLedger?.scope === "repository_baseline_review";
}

export function applyDirectPaperclipApiPolicy(
  env: Record<string, string>,
  input: { disableDirectApi: boolean; reason?: string | null },
): Record<string, string> {
  if (!input.disableDirectApi) return env;
  const nextEnv = { ...env };
  nextEnv.PAPERCLIP_DIRECT_API_DISABLED = "true";
  nextEnv.PAPERCLIP_DIRECT_API_DISABLED_REASON =
    input.reason?.trim() || "repo_first_ceo_baseline_review";
  delete nextEnv.PAPERCLIP_API_KEY;
  return nextEnv;
}

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative.length === 0 ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export function resolveAllowedInstructionsFilePath(input: {
  cwd: string;
  instructionsFilePath: string;
  instructionsBundleMode?: string | null;
  instructionsRootPath?: string | null;
}): {
  resolvedInstructionsFilePath: string;
  effectiveInstructionsFilePath: string;
  warning: string | null;
} {
  const instructionsFilePath = input.instructionsFilePath.trim();
  if (!instructionsFilePath) {
    return {
      resolvedInstructionsFilePath: "",
      effectiveInstructionsFilePath: "",
      warning: null,
    };
  }

  const resolvedInstructionsFilePath = path.resolve(input.cwd, instructionsFilePath);
  if (isPathWithinRoot(resolvedInstructionsFilePath, input.cwd)) {
    return {
      resolvedInstructionsFilePath,
      effectiveInstructionsFilePath: resolvedInstructionsFilePath,
      warning: null,
    };
  }

  const instructionsBundleMode = input.instructionsBundleMode?.trim() ?? "";
  const instructionsRootPath = input.instructionsRootPath?.trim() ?? "";
  if (instructionsBundleMode === "managed" && instructionsRootPath) {
    const resolvedInstructionsRootPath = path.resolve(instructionsRootPath);
    if (isPathWithinRoot(resolvedInstructionsFilePath, resolvedInstructionsRootPath)) {
      return {
        resolvedInstructionsFilePath,
        effectiveInstructionsFilePath: resolvedInstructionsFilePath,
        warning: null,
      };
    }
  }

  return {
    resolvedInstructionsFilePath,
    effectiveInstructionsFilePath: "",
    warning:
      `[paperclip] Warning: instructionsFilePath must stay within cwd "${input.cwd}" ` +
      `or the managed instructions root; ignoring "${resolvedInstructionsFilePath}".\n`,
  };
}

type PaperclipWakeIssue = {
  id: string | null;
  identifier: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
};

type PaperclipWakeExecutionPrincipal = {
  type: "agent" | "user" | null;
  agentId: string | null;
  userId: string | null;
};

type PaperclipWakeExecutionStage = {
  wakeRole: "reviewer" | "approver" | "executor" | null;
  stageId: string | null;
  stageType: string | null;
  currentParticipant: PaperclipWakeExecutionPrincipal | null;
  returnAssignee: PaperclipWakeExecutionPrincipal | null;
  lastDecisionOutcome: string | null;
  allowedActions: string[];
};

type PaperclipWakeComment = {
  id: string | null;
  issueId: string | null;
  body: string;
  bodyTruncated: boolean;
  createdAt: string | null;
  authorType: string | null;
  authorId: string | null;
};

type PaperclipWakeProjectIssueSystem = {
  labels: Array<{
    id: string | null;
    name: string;
    color: string | null;
    description: string | null;
  }>;
  parentChildGuidance: string[];
  blockingGuidance: string[];
  labelUsageGuidance: string[];
  reviewGuidance: string[];
  approvalGuidance: string[];
  canonicalDocs: string[];
  suggestedVerificationCommands: string[];
};

type PaperclipWakePayload = {
  reason: string | null;
  issue: PaperclipWakeIssue | null;
  projectIssueSystem: PaperclipWakeProjectIssueSystem | null;
  checkedOutByHarness: boolean;
  executionStage: PaperclipWakeExecutionStage | null;
  commentIds: string[];
  latestCommentId: string | null;
  comments: PaperclipWakeComment[];
  requestedCount: number;
  includedCount: number;
  missingCount: number;
  truncated: boolean;
  fallbackFetchNeeded: boolean;
};

function normalizePaperclipTruthLedger(value: unknown): PaperclipTruthLedger | null {
  const record = parseObject(value);
  const scopeRaw = asString(record.scope, "").trim().toLowerCase();
  const scope =
    scopeRaw === "repository_baseline_review" || scopeRaw === "issue_scoped" ? scopeRaw : null;
  const authoritativeSources = Array.isArray(record.authoritativeSources)
    ? record.authoritativeSources
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
  const issueCommentRequired = asBoolean(record.issueCommentRequired, false);
  const finalSummaryMayBecomeIssueComment = asBoolean(
    record.finalSummaryMayBecomeIssueComment,
    false,
  );
  const localShellProbesAreAuxiliary = asBoolean(record.localShellProbesAreAuxiliary, false);
  const apiRootIsNotOperationalProof = asBoolean(record.apiRootIsNotOperationalProof, false);

  if (
    !scope &&
    authoritativeSources.length === 0 &&
    !issueCommentRequired &&
    !finalSummaryMayBecomeIssueComment &&
    !localShellProbesAreAuxiliary &&
    !apiRootIsNotOperationalProof
  ) {
    return null;
  }

  return {
    scope,
    authoritativeSources,
    issueCommentRequired,
    finalSummaryMayBecomeIssueComment,
    localShellProbesAreAuxiliary,
    apiRootIsNotOperationalProof,
  };
}

function normalizePaperclipWakeIssue(value: unknown): PaperclipWakeIssue | null {
  const issue = parseObject(value);
  const id = asString(issue.id, "").trim() || null;
  const identifier = asString(issue.identifier, "").trim() || null;
  const title = asString(issue.title, "").trim() || null;
  const status = asString(issue.status, "").trim() || null;
  const priority = asString(issue.priority, "").trim() || null;
  if (!id && !identifier && !title) return null;
  return {
    id,
    identifier,
    title,
    status,
    priority,
  };
}

function normalizePaperclipWakeComment(value: unknown): PaperclipWakeComment | null {
  const comment = parseObject(value);
  const author = parseObject(comment.author);
  const body = asString(comment.body, "");
  if (!body.trim()) return null;
  return {
    id: asString(comment.id, "").trim() || null,
    issueId: asString(comment.issueId, "").trim() || null,
    body,
    bodyTruncated: asBoolean(comment.bodyTruncated, false),
    createdAt: asString(comment.createdAt, "").trim() || null,
    authorType: asString(author.type, "").trim() || null,
    authorId: asString(author.id, "").trim() || null,
  };
}

function normalizePaperclipWakeExecutionPrincipal(value: unknown): PaperclipWakeExecutionPrincipal | null {
  const principal = parseObject(value);
  const typeRaw = asString(principal.type, "").trim().toLowerCase();
  if (typeRaw !== "agent" && typeRaw !== "user") return null;
  return {
    type: typeRaw,
    agentId: asString(principal.agentId, "").trim() || null,
    userId: asString(principal.userId, "").trim() || null,
  };
}

function normalizePaperclipWakeExecutionStage(value: unknown): PaperclipWakeExecutionStage | null {
  const stage = parseObject(value);
  const wakeRoleRaw = asString(stage.wakeRole, "").trim().toLowerCase();
  const wakeRole =
    wakeRoleRaw === "reviewer" || wakeRoleRaw === "approver" || wakeRoleRaw === "executor"
      ? wakeRoleRaw
      : null;
  const allowedActions = Array.isArray(stage.allowedActions)
    ? stage.allowedActions
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
  const currentParticipant = normalizePaperclipWakeExecutionPrincipal(stage.currentParticipant);
  const returnAssignee = normalizePaperclipWakeExecutionPrincipal(stage.returnAssignee);
  const stageId = asString(stage.stageId, "").trim() || null;
  const stageType = asString(stage.stageType, "").trim() || null;
  const lastDecisionOutcome = asString(stage.lastDecisionOutcome, "").trim() || null;

  if (!wakeRole && !stageId && !stageType && !currentParticipant && !returnAssignee && !lastDecisionOutcome && allowedActions.length === 0) {
    return null;
  }

  return {
    wakeRole,
    stageId,
    stageType,
    currentParticipant,
    returnAssignee,
    lastDecisionOutcome,
    allowedActions,
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

function normalizePaperclipWakeProjectIssueSystem(value: unknown): PaperclipWakeProjectIssueSystem | null {
  const system = parseObject(value);
  const labels = Array.isArray(system.labels)
    ? system.labels
        .map((entry) => {
          const label = parseObject(entry);
          const name = asString(label.name, "").trim();
          if (!name) return null;
          return {
            id: asString(label.id, "").trim() || null,
            name,
            color: asString(label.color, "").trim() || null,
            description: asString(label.description, "").trim() || null,
          };
        })
        .filter((entry): entry is PaperclipWakeProjectIssueSystem["labels"][number] => Boolean(entry))
    : [];
  const normalized = {
    labels,
    parentChildGuidance: normalizeStringArray(system.parentChildGuidance),
    blockingGuidance: normalizeStringArray(system.blockingGuidance),
    labelUsageGuidance: normalizeStringArray(system.labelUsageGuidance),
    reviewGuidance: normalizeStringArray(system.reviewGuidance),
    approvalGuidance: normalizeStringArray(system.approvalGuidance),
    canonicalDocs: normalizeStringArray(system.canonicalDocs),
    suggestedVerificationCommands: normalizeStringArray(system.suggestedVerificationCommands),
  };
  if (
    normalized.labels.length === 0 &&
    normalized.parentChildGuidance.length === 0 &&
    normalized.blockingGuidance.length === 0 &&
    normalized.labelUsageGuidance.length === 0 &&
    normalized.reviewGuidance.length === 0 &&
    normalized.approvalGuidance.length === 0 &&
    normalized.canonicalDocs.length === 0 &&
    normalized.suggestedVerificationCommands.length === 0
  ) {
    return null;
  }
  return normalized;
}

export function normalizePaperclipWakePayload(value: unknown): PaperclipWakePayload | null {
  const payload = parseObject(value);
  const comments = Array.isArray(payload.comments)
    ? payload.comments
        .map((entry) => normalizePaperclipWakeComment(entry))
        .filter((entry): entry is PaperclipWakeComment => Boolean(entry))
    : [];
  const commentWindow = parseObject(payload.commentWindow);
  const commentIds = Array.isArray(payload.commentIds)
    ? payload.commentIds
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
  const executionStage = normalizePaperclipWakeExecutionStage(payload.executionStage);

  if (comments.length === 0 && commentIds.length === 0 && !executionStage && !normalizePaperclipWakeIssue(payload.issue)) {
    return null;
  }

  return {
    reason: asString(payload.reason, "").trim() || null,
    issue: normalizePaperclipWakeIssue(payload.issue),
    projectIssueSystem: normalizePaperclipWakeProjectIssueSystem(payload.projectIssueSystem),
    checkedOutByHarness: asBoolean(payload.checkedOutByHarness, false),
    executionStage,
    commentIds,
    latestCommentId: asString(payload.latestCommentId, "").trim() || null,
    comments,
    requestedCount: asNumber(commentWindow.requestedCount, comments.length || commentIds.length),
    includedCount: asNumber(commentWindow.includedCount, comments.length),
    missingCount: asNumber(commentWindow.missingCount, 0),
    truncated: asBoolean(payload.truncated, false),
    fallbackFetchNeeded: asBoolean(payload.fallbackFetchNeeded, false),
  };
}

export function stringifyPaperclipWakePayload(value: unknown): string | null {
  const normalized = normalizePaperclipWakePayload(value);
  if (!normalized) return null;
  return JSON.stringify(normalized);
}

export function renderPaperclipWakePrompt(
  value: unknown,
  options: { resumedSession?: boolean; truthLedger?: unknown } = {},
): string {
  const normalized = normalizePaperclipWakePayload(value);
  const truthLedger = normalizePaperclipTruthLedger(options.truthLedger);
  if (!normalized && !truthLedger) return "";
  const payload =
    normalized ??
    ({
      reason: null,
      issue: null,
      projectIssueSystem: null,
      checkedOutByHarness: false,
      executionStage: null,
      commentIds: [],
      latestCommentId: null,
      comments: [],
      requestedCount: 0,
      includedCount: 0,
      missingCount: 0,
      truncated: false,
      fallbackFetchNeeded: false,
    } satisfies PaperclipWakePayload);
  const resumedSession = options.resumedSession === true;
  const executionStage = payload.executionStage;
  const commentAwareWake =
    payload.requestedCount > 0 || payload.includedCount > 0 || Boolean(payload.latestCommentId);
  const directApiDisabledForWake = truthLedger?.scope === "repository_baseline_review";
  const principalLabel = (principal: PaperclipWakeExecutionPrincipal | null) => {
    if (!principal || !principal.type) return "unknown";
    if (principal.type === "agent") return principal.agentId ? `agent ${principal.agentId}` : "agent";
    return principal.userId ? `user ${principal.userId}` : "user";
  };

  const lines = resumedSession
      ? [
        "## Paperclip Resume Delta",
        "",
        "You are resuming an existing Paperclip session.",
        "This heartbeat is scoped to the issue below. Do not switch to another issue until you have handled this wake.",
        "Focus on the new wake delta below and continue the current task without restating the full heartbeat boilerplate.",
        directApiDisabledForWake
          ? "For this repo-first review wake, do not fetch the API thread directly even when `fallbackFetchNeeded` is true; use this inline wake payload as the source of truth."
          : "Fetch the API thread only when `fallbackFetchNeeded` is true or you need broader history than this batch.",
        directApiDisabledForWake
          ? "Do not call `/api/issues/{id}/heartbeat-context`, `/api/issues/{id}`, or `/api/issues/{id}/comments` directly in this wake."
          : "Do not call `/api/issues/{id}/heartbeat-context` when `fallbackFetchNeeded` is false; use this inline wake payload as the source of truth for the current wake.",
        "",
        `- reason: ${payload.reason ?? "unknown"}`,
        `- issue: ${payload.issue?.identifier ?? payload.issue?.id ?? "unknown"}${payload.issue?.title ? ` ${payload.issue.title}` : ""}`,
        `- pending comments: ${payload.includedCount}/${payload.requestedCount}`,
        `- latest comment id: ${payload.latestCommentId ?? "unknown"}`,
        `- fallback fetch needed: ${payload.fallbackFetchNeeded ? "yes" : "no"}`,
      ]
    : [
        "## Paperclip Wake Payload",
        "",
        "Treat this wake payload as the highest-priority change for the current heartbeat.",
        "This heartbeat is scoped to the issue below. Do not switch to another issue until you have handled this wake.",
        commentAwareWake
          ? "Before generic repo exploration or boilerplate heartbeat updates, acknowledge the latest comment and explain how it changes your next action."
          : "Before generic repo exploration or boilerplate heartbeat updates, explain how this wake changes your next action.",
        "Use this inline wake data first before refetching the issue thread.",
        directApiDisabledForWake
          ? "For this repo-first review wake, do not fetch the API thread directly even when `fallbackFetchNeeded` is true; use this inline wake payload as the source of truth."
          : "Only fetch the API thread when `fallbackFetchNeeded` is true or you need broader history than this batch.",
        directApiDisabledForWake
          ? "Do not call `/api/issues/{id}/heartbeat-context`, `/api/issues/{id}`, or `/api/issues/{id}/comments` directly in this wake."
          : "Do not call `/api/issues/{id}/heartbeat-context` when `fallbackFetchNeeded` is false; use this inline wake payload as the source of truth for the current wake.",
        "",
        `- reason: ${payload.reason ?? "unknown"}`,
        `- issue: ${payload.issue?.identifier ?? payload.issue?.id ?? "unknown"}${payload.issue?.title ? ` ${payload.issue.title}` : ""}`,
        `- pending comments: ${payload.includedCount}/${payload.requestedCount}`,
        `- latest comment id: ${payload.latestCommentId ?? "unknown"}`,
        `- fallback fetch needed: ${payload.fallbackFetchNeeded ? "yes" : "no"}`,
      ];

  if (payload.issue?.status) {
    lines.push(`- issue status: ${payload.issue.status}`);
  }
  if (payload.issue?.priority) {
    lines.push(`- issue priority: ${payload.issue.priority}`);
  }
  if (payload.projectIssueSystem) {
    const system = payload.projectIssueSystem;
    lines.push("", "## Paperclip Project Issue System", "");
    if (system.labels.length > 0) {
      lines.push("Available labels:");
      for (const label of system.labels) {
        lines.push(`- ${label.name}${label.description ? `: ${label.description}` : ""}`);
      }
      lines.push("");
    }
    if (system.parentChildGuidance.length > 0) {
      lines.push("Parent/sub-issue policy:", ...system.parentChildGuidance.map((entry) => `- ${entry}`), "");
    }
    if (system.blockingGuidance.length > 0) {
      lines.push("Blocking policy:", ...system.blockingGuidance.map((entry) => `- ${entry}`), "");
    }
    if (system.labelUsageGuidance.length > 0) {
      lines.push("Label usage:", ...system.labelUsageGuidance.map((entry) => `- ${entry}`), "");
    }
    if (system.reviewGuidance.length > 0 || system.approvalGuidance.length > 0) {
      lines.push(
        "Review and approval policy:",
        ...system.reviewGuidance.map((entry) => `- Review: ${entry}`),
        ...system.approvalGuidance.map((entry) => `- Approval: ${entry}`),
        "",
      );
    }
    if (system.canonicalDocs.length > 0 || system.suggestedVerificationCommands.length > 0) {
      lines.push(
        "Project defaults:",
        ...system.canonicalDocs.map((entry) => `- Read first: ${entry}`),
        ...system.suggestedVerificationCommands.map((entry) => `- Verify with: ${entry}`),
        "",
      );
    }
  }
  if (payload.checkedOutByHarness) {
    lines.push("- checkout: already claimed by the harness for this run");
  }
  if (payload.missingCount > 0) {
    lines.push(`- omitted comments: ${payload.missingCount}`);
  }

  if (executionStage) {
    lines.push(
      `- execution wake role: ${executionStage.wakeRole ?? "unknown"}`,
      `- execution stage: ${executionStage.stageType ?? "unknown"}`,
      `- execution participant: ${principalLabel(executionStage.currentParticipant)}`,
      `- execution return assignee: ${principalLabel(executionStage.returnAssignee)}`,
      `- last decision outcome: ${executionStage.lastDecisionOutcome ?? "none"}`,
    );
    if (executionStage.allowedActions.length > 0) {
      lines.push(`- allowed actions: ${executionStage.allowedActions.join(", ")}`);
    }
    lines.push("");
    if (executionStage.wakeRole === "reviewer" || executionStage.wakeRole === "approver") {
      lines.push(
        `You are waking as the active ${executionStage.wakeRole} for this issue.`,
        "Do not execute the task itself or continue executor work.",
        "Review the issue and choose one of the allowed actions above.",
        "If you request changes, the workflow routes back to the stored return assignee.",
        "",
      );
    } else if (executionStage.wakeRole === "executor") {
      lines.push(
        "You are waking because changes were requested in the execution workflow.",
        "Address the requested changes on this issue and resubmit when the work is ready.",
        "",
      );
    }
  }

  if (truthLedger) {
    lines.push("", "## Paperclip Truth Ledger", "");
    if (truthLedger.scope === "repository_baseline_review") {
      lines.push("- scope: repository baseline review");
      lines.push(
        "- direct Paperclip API reads and mutations are disabled for this wake; do not `curl` the issue thread or patch the issue yourself",
        "- even when `fallbackFetchNeeded` is yes, use the inline wake payload, managed instructions, and repository evidence instead of direct API reads",
      );
    } else if (truthLedger.scope === "issue_scoped") {
      lines.push("- scope: issue-scoped wake");
    }
    if (truthLedger.authoritativeSources.length > 0) {
      lines.push(`- authoritative sources: ${truthLedger.authoritativeSources.join(" > ")}`);
    }
    if (truthLedger.issueCommentRequired) {
      lines.push("- this wake requires an issue-thread update before the run is considered satisfied");
    }
    if (truthLedger.finalSummaryMayBecomeIssueComment) {
      lines.push("- your final summary may be persisted by Paperclip as the issue-thread update for this run");
    }
    if (truthLedger.localShellProbesAreAuxiliary) {
      lines.push("- local shell probes are auxiliary diagnostics only and cannot override inline wake data or actual Paperclip mutation results");
    }
    if (truthLedger.apiRootIsNotOperationalProof) {
      lines.push("- do not treat the bare `PAPERCLIP_API_URL` root as an operational proof probe; use `PAPERCLIP_API_BASE` or `PAPERCLIP_HEALTH_URL` instead");
    }
    lines.push(
      "If Paperclip persists your final summary as the issue comment, do not say the thread may have remained unupdated unless an actual Paperclip API mutation failed in this run.",
      "",
    );
  }

  if (payload.checkedOutByHarness) {
    lines.push(
      "",
      "The harness already checked out this issue for the current run.",
      "Do not call `/api/issues/{id}/checkout` again unless you intentionally switch to a different task.",
      "Do not use raw `curl` control-plane probes for routine confirmation when this wake payload already gives you the current issue state.",
      "",
    );
  }

  if (payload.comments.length > 0) {
    lines.push("New comments in order:");
  }

  for (const [index, comment] of payload.comments.entries()) {
    const authorLabel = comment.authorId
      ? `${comment.authorType ?? "unknown"} ${comment.authorId}`
      : comment.authorType ?? "unknown";
    lines.push(
      `${index + 1}. comment ${comment.id ?? "unknown"} at ${comment.createdAt ?? "unknown"} by ${authorLabel}`,
      comment.body,
    );
    if (comment.bodyTruncated) {
      lines.push("[comment body truncated]");
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function redactEnvForLogs(env: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    redacted[key] =
      SENSITIVE_ENV_KEY.test(key) || SENSITIVE_ENV_EXACT_KEYS.has(key.toUpperCase())
        ? "***REDACTED***"
        : value;
  }
  return redacted;
}

export function buildInvocationEnvForLogs(
  env: Record<string, string>,
  options: {
    runtimeEnv?: NodeJS.ProcessEnv | Record<string, string>;
    includeRuntimeKeys?: string[];
    resolvedCommand?: string | null;
    resolvedCommandEnvKey?: string;
  } = {},
): Record<string, string> {
  const merged: Record<string, string> = { ...env };
  const runtimeEnv = options.runtimeEnv ?? {};

  for (const key of options.includeRuntimeKeys ?? []) {
    if (key in merged) continue;
    const value = runtimeEnv[key];
    if (typeof value !== "string" || value.length === 0) continue;
    merged[key] = value;
  }

  const resolvedCommand = options.resolvedCommand?.trim();
  if (resolvedCommand) {
    merged[options.resolvedCommandEnvKey ?? "PAPERCLIP_RESOLVED_COMMAND"] = resolvedCommand;
  }

  return redactEnvForLogs(merged);
}

export function buildPaperclipEnv(agent: { id: string; companyId: string }): Record<string, string> {
  const resolveHostForUrl = (rawHost: string): string => {
    const host = rawHost.trim();
    if (!host || host === "0.0.0.0" || host === "::") return "localhost";
    if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) return `[${host}]`;
    return host;
  };
  const vars: Record<string, string> = {
    PAPERCLIP_AGENT_ID: agent.id,
    PAPERCLIP_COMPANY_ID: agent.companyId,
  };
  const runtimeHost = resolveHostForUrl(
    process.env.PAPERCLIP_LISTEN_HOST ?? process.env.HOST ?? "localhost",
  );
  const runtimePort = process.env.PAPERCLIP_LISTEN_PORT ?? process.env.PORT ?? "3100";
  const apiUrl = (process.env.PAPERCLIP_API_URL ?? `http://${runtimeHost}:${runtimePort}`).replace(/\/+$/, "");
  const apiBase = apiUrl.endsWith("/api") ? apiUrl : `${apiUrl}/api`;
  vars.PAPERCLIP_API_URL = apiUrl;
  vars.PAPERCLIP_API_BASE = apiBase;
  vars.PAPERCLIP_HEALTH_URL = `${apiBase}/health`;
  return vars;
}

export function applyPaperclipWorkspaceEnv(
  env: Record<string, string>,
  input: {
    workspaceCwd?: string | null;
    workspaceSource?: string | null;
    workspaceStrategy?: string | null;
    workspaceId?: string | null;
    workspaceRepoUrl?: string | null;
    workspaceRepoRef?: string | null;
    workspaceBranch?: string | null;
    workspaceWorktreePath?: string | null;
    agentHome?: string | null;
  },
): Record<string, string> {
  const mappings = [
    ["PAPERCLIP_WORKSPACE_CWD", input.workspaceCwd],
    ["PAPERCLIP_WORKSPACE_SOURCE", input.workspaceSource],
    ["PAPERCLIP_WORKSPACE_STRATEGY", input.workspaceStrategy],
    ["PAPERCLIP_WORKSPACE_ID", input.workspaceId],
    ["PAPERCLIP_WORKSPACE_REPO_URL", input.workspaceRepoUrl],
    ["PAPERCLIP_WORKSPACE_REPO_REF", input.workspaceRepoRef],
    ["PAPERCLIP_WORKSPACE_BRANCH", input.workspaceBranch],
    ["PAPERCLIP_WORKSPACE_WORKTREE_PATH", input.workspaceWorktreePath],
    ["AGENT_HOME", input.agentHome],
  ] as const;

  for (const [key, value] of mappings) {
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  return env;
}

export function resolvePaperclipWorkspaceBranch(workspaceContext: Record<string, unknown>): string {
  return asString(workspaceContext.branchName, "") || asString(workspaceContext.branch, "");
}

export function defaultPathForPlatform() {
  if (process.platform === "win32") {
    return "C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem";
  }
  return "/usr/local/bin:/opt/homebrew/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin";
}

function windowsPathExts(env: NodeJS.ProcessEnv): string[] {
  return (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean);
}

async function pathExists(candidate: string) {
  try {
    await fs.access(candidate, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommandPath(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  if (hasPathSeparator) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    return (await pathExists(absolute)) ? absolute : null;
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  const dirs = pathValue.split(delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? windowsPathExts(env) : [""];
  const hasExtension = process.platform === "win32" && path.extname(command).length > 0;

  for (const dir of dirs) {
    const candidates =
      process.platform === "win32"
        ? hasExtension
          ? [path.join(dir, command)]
          : exts.map((ext) => path.join(dir, `${command}${ext}`))
        : [path.join(dir, command)];
    for (const candidate of candidates) {
      if (await pathExists(candidate)) return candidate;
    }
  }

  return null;
}

export async function resolveCommandForLogs(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  return (await resolveCommandPath(command, cwd, env)) ?? command;
}

function quoteForCmd(arg: string) {
  if (!arg.length) return '""';
  const escaped = arg.replace(/%/g, "%%").replace(/"/g, '""');
  return /[\s"&<>|^()]/.test(escaped) ? `"${escaped}"` : escaped;
}

function resolveWindowsCmdShell(env: NodeJS.ProcessEnv): string {
  const fallbackRoot = env.SystemRoot || process.env.SystemRoot || "C:\\Windows";
  return path.join(fallbackRoot, "System32", "cmd.exe");
}

async function resolveSpawnTarget(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<SpawnTarget> {
  const resolved = await resolveCommandPath(command, cwd, env);
  const executable = resolved ?? command;

  if (process.platform !== "win32") {
    return { command: executable, args };
  }

  if (/\.(cmd|bat)$/i.test(executable)) {
    // Always use cmd.exe for .cmd/.bat wrappers. Some environments override
    // ComSpec to PowerShell, which breaks cmd-specific flags like /d /s /c.
    const shell = resolveWindowsCmdShell(env);
    const commandLine = [quoteForCmd(executable), ...args.map(quoteForCmd)].join(" ");
    return {
      command: shell,
      args: ["/d", "/s", "/c", commandLine],
    };
  }

  return { command: executable, args };
}

export function ensurePathInEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (typeof env.PATH === "string" && env.PATH.length > 0) return env;
  if (typeof env.Path === "string" && env.Path.length > 0) return env;
  return { ...env, PATH: defaultPathForPlatform() };
}

export async function ensureAbsoluteDirectory(
  cwd: string,
  opts: { createIfMissing?: boolean } = {},
) {
  if (!path.isAbsolute(cwd)) {
    throw new Error(`Working directory must be an absolute path: "${cwd}"`);
  }

  const assertDirectory = async () => {
    const stats = await fs.stat(cwd);
    if (!stats.isDirectory()) {
      throw new Error(`Working directory is not a directory: "${cwd}"`);
    }
  };

  try {
    await assertDirectory();
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!opts.createIfMissing || code !== "ENOENT") {
      if (code === "ENOENT") {
        throw new Error(`Working directory does not exist: "${cwd}"`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  try {
    await fs.mkdir(cwd, { recursive: true });
    await assertDirectory();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not create working directory "${cwd}": ${reason}`);
  }
}

export async function resolvePaperclipSkillsDir(
  moduleDir: string,
  additionalCandidates: string[] = [],
): Promise<string | null> {
  const candidates = [
    ...PAPERCLIP_SKILL_ROOT_RELATIVE_CANDIDATES.map((relativePath) => path.resolve(moduleDir, relativePath)),
    ...additionalCandidates.map((candidate) => path.resolve(candidate)),
  ];
  const seenRoots = new Set<string>();

  for (const root of candidates) {
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    const isDirectory = await fs.stat(root).then((stats) => stats.isDirectory()).catch(() => false);
    if (isDirectory) return root;
  }

  return null;
}

export async function listPaperclipSkillEntries(
  moduleDir: string,
  additionalCandidates: string[] = [],
): Promise<PaperclipSkillEntry[]> {
  const root = await resolvePaperclipSkillsDir(moduleDir, additionalCandidates);
  if (!root) return [];

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        key: `paperclipai/paperclip/${entry.name}`,
        runtimeName: entry.name,
        source: path.join(root, entry.name),
        required: true,
        requiredReason: "Bundled Paperclip skills are always available for local adapters.",
      }));
  } catch {
    return [];
  }
}

export async function readInstalledSkillTargets(skillsHome: string): Promise<Map<string, InstalledSkillTarget>> {
  const entries = await fs.readdir(skillsHome, { withFileTypes: true }).catch(() => []);
  const out = new Map<string, InstalledSkillTarget>();
  for (const entry of entries) {
    const fullPath = path.join(skillsHome, entry.name);
    const linkedPath = entry.isSymbolicLink() ? await fs.readlink(fullPath).catch(() => null) : null;
    out.set(entry.name, resolveInstalledEntryTarget(skillsHome, entry.name, entry, linkedPath));
  }
  return out;
}

export function buildPersistentSkillSnapshot(
  options: PersistentSkillSnapshotOptions,
): AdapterSkillSnapshot {
  const {
    adapterType,
    availableEntries,
    desiredSkills,
    installed,
    skillsHome,
    locationLabel,
    installedDetail,
    missingDetail,
    externalConflictDetail,
    externalDetail,
  } = options;
  const availableByKey = new Map(availableEntries.map((entry) => [entry.key, entry]));
  const desiredSet = new Set(desiredSkills);
  const entries: AdapterSkillEntry[] = [];
  const warnings = [...(options.warnings ?? [])];

  for (const available of availableEntries) {
    const installedEntry = installed.get(available.runtimeName) ?? null;
    const desired = desiredSet.has(available.key);
    let state: AdapterSkillEntry["state"] = "available";
    let managed = false;
    let detail: string | null = null;

    if (installedEntry?.targetPath === available.source) {
      managed = true;
      state = desired ? "installed" : "stale";
      detail = installedDetail ?? null;
    } else if (installedEntry) {
      state = "external";
      detail = desired ? externalConflictDetail : externalDetail;
    } else if (desired) {
      state = "missing";
      detail = missingDetail;
    }

    entries.push({
      key: available.key,
      runtimeName: available.runtimeName,
      desired,
      managed,
      state,
      sourcePath: available.source,
      targetPath: path.join(skillsHome, available.runtimeName),
      detail,
      required: Boolean(available.required),
      requiredReason: available.requiredReason ?? null,
      ...buildManagedSkillOrigin(available),
    });
  }

  for (const desiredSkill of desiredSkills) {
    if (availableByKey.has(desiredSkill)) continue;
    warnings.push(`Desired skill "${desiredSkill}" is not available from the Paperclip skills directory.`);
    entries.push({
      key: desiredSkill,
      runtimeName: null,
      desired: true,
      managed: true,
      state: "missing",
      sourcePath: null,
      targetPath: null,
      detail: "Paperclip cannot find this skill in the local runtime skills directory.",
      origin: "external_unknown",
      originLabel: "External or unavailable",
      readOnly: false,
    });
  }

  for (const [name, installedEntry] of installed.entries()) {
    if (availableEntries.some((entry) => entry.runtimeName === name)) continue;
    entries.push({
      key: name,
      runtimeName: name,
      desired: false,
      managed: false,
      state: "external",
      origin: "user_installed",
      originLabel: "User-installed",
      locationLabel: skillLocationLabel(locationLabel),
      readOnly: true,
      sourcePath: null,
      targetPath: installedEntry.targetPath ?? path.join(skillsHome, name),
      detail: externalDetail,
    });
  }

  entries.sort((left, right) => left.key.localeCompare(right.key));

  return {
    adapterType,
    supported: true,
    mode: "persistent",
    desiredSkills,
    entries,
    warnings,
  };
}

function normalizeConfiguredPaperclipRuntimeSkills(value: unknown): PaperclipSkillEntry[] {
  if (!Array.isArray(value)) return [];
  const out: PaperclipSkillEntry[] = [];
  for (const rawEntry of value) {
    const entry = parseObject(rawEntry);
    const key = asString(entry.key, asString(entry.name, "")).trim();
    const runtimeName = asString(entry.runtimeName, asString(entry.name, "")).trim();
    const source = asString(entry.source, "").trim();
    if (!key || !runtimeName || !source) continue;
    out.push({
      key,
      runtimeName,
      source,
      required: asBoolean(entry.required, false),
      requiredReason:
        typeof entry.requiredReason === "string" && entry.requiredReason.trim().length > 0
          ? entry.requiredReason.trim()
          : null,
    });
  }
  return out;
}

export async function readPaperclipRuntimeSkillEntries(
  config: Record<string, unknown>,
  moduleDir: string,
  additionalCandidates: string[] = [],
): Promise<PaperclipSkillEntry[]> {
  const configuredEntries = normalizeConfiguredPaperclipRuntimeSkills(config.paperclipRuntimeSkills);
  if (configuredEntries.length > 0) return configuredEntries;
  return listPaperclipSkillEntries(moduleDir, additionalCandidates);
}

export async function readPaperclipSkillMarkdown(
  moduleDir: string,
  skillKey: string,
): Promise<string | null> {
  const normalized = skillKey.trim().toLowerCase();
  if (!normalized) return null;

  const entries = await listPaperclipSkillEntries(moduleDir);
  const match = entries.find((entry) => entry.key === normalized);
  if (!match) return null;

  try {
    return await fs.readFile(path.join(match.source, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
}

export function readPaperclipSkillSyncPreference(config: Record<string, unknown>): {
  explicit: boolean;
  desiredSkills: string[];
} {
  const raw = config.paperclipSkillSync;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { explicit: false, desiredSkills: [] };
  }
  const syncConfig = raw as Record<string, unknown>;
  const desiredValues = syncConfig.desiredSkills;
  const desired = Array.isArray(desiredValues)
    ? desiredValues
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  return {
    explicit: Object.prototype.hasOwnProperty.call(raw, "desiredSkills"),
    desiredSkills: Array.from(new Set(desired)),
  };
}

function canonicalizeDesiredPaperclipSkillReference(
  reference: string,
  availableEntries: Array<{ key: string; runtimeName?: string | null }>,
): string {
  const normalizedReference = reference.trim().toLowerCase();
  if (!normalizedReference) return "";

  const exactKey = availableEntries.find((entry) => entry.key.trim().toLowerCase() === normalizedReference);
  if (exactKey) return exactKey.key;

  const byRuntimeName = availableEntries.filter((entry) =>
    typeof entry.runtimeName === "string" && entry.runtimeName.trim().toLowerCase() === normalizedReference,
  );
  if (byRuntimeName.length === 1) return byRuntimeName[0]!.key;

  const slugMatches = availableEntries.filter((entry) =>
    entry.key.trim().toLowerCase().split("/").pop() === normalizedReference,
  );
  if (slugMatches.length === 1) return slugMatches[0]!.key;

  return normalizedReference;
}

export function resolvePaperclipDesiredSkillNames(
  config: Record<string, unknown>,
  availableEntries: Array<{ key: string; runtimeName?: string | null; required?: boolean }>,
): string[] {
  const preference = readPaperclipSkillSyncPreference(config);
  const requiredSkills = availableEntries
    .filter((entry) => entry.required)
    .map((entry) => entry.key);
  if (!preference.explicit) {
    return Array.from(new Set(requiredSkills));
  }
  const desiredSkills = preference.desiredSkills
    .map((reference) => canonicalizeDesiredPaperclipSkillReference(reference, availableEntries))
    .filter(Boolean);
  return Array.from(new Set([...requiredSkills, ...desiredSkills]));
}

export function writePaperclipSkillSyncPreference(
  config: Record<string, unknown>,
  desiredSkills: string[],
): Record<string, unknown> {
  const next = { ...config };
  const raw = next.paperclipSkillSync;
  const current =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  current.desiredSkills = Array.from(
    new Set(
      desiredSkills
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  next.paperclipSkillSync = current;
  return next;
}

export async function ensurePaperclipSkillSymlink(
  source: string,
  target: string,
  linkSkill: (source: string, target: string) => Promise<void> = (linkSource, linkTarget) =>
    fs.symlink(linkSource, linkTarget),
): Promise<"created" | "repaired" | "skipped"> {
  const existing = await fs.lstat(target).catch(() => null);
  if (!existing) {
    await linkSkill(source, target);
    return "created";
  }

  if (!existing.isSymbolicLink()) {
    return "skipped";
  }

  const linkedPath = await fs.readlink(target).catch(() => null);
  if (!linkedPath) return "skipped";

  const resolvedLinkedPath = path.resolve(path.dirname(target), linkedPath);
  if (resolvedLinkedPath === source) {
    return "skipped";
  }

  const linkedPathExists = await fs.stat(resolvedLinkedPath).then(() => true).catch(() => false);
  if (linkedPathExists) {
    return "skipped";
  }

  await fs.unlink(target);
  await linkSkill(source, target);
  return "repaired";
}

export async function removeMaintainerOnlySkillSymlinks(
  skillsHome: string,
  allowedSkillNames: Iterable<string>,
): Promise<string[]> {
  const allowed = new Set(Array.from(allowedSkillNames));
  try {
    const entries = await fs.readdir(skillsHome, { withFileTypes: true });
    const removed: string[] = [];
    for (const entry of entries) {
      if (allowed.has(entry.name)) continue;

      const target = path.join(skillsHome, entry.name);
      const existing = await fs.lstat(target).catch(() => null);
      if (!existing?.isSymbolicLink()) continue;

      const linkedPath = await fs.readlink(target).catch(() => null);
      if (!linkedPath) continue;

      const resolvedLinkedPath = path.isAbsolute(linkedPath)
        ? linkedPath
        : path.resolve(path.dirname(target), linkedPath);
      if (
        !isMaintainerOnlySkillTarget(linkedPath) &&
        !isMaintainerOnlySkillTarget(resolvedLinkedPath)
      ) {
        continue;
      }

      await fs.unlink(target);
      removed.push(entry.name);
    }

    return removed;
  } catch {
    return [];
  }
}

export async function ensureCommandResolvable(command: string, cwd: string, env: NodeJS.ProcessEnv) {
  const resolved = await resolveCommandPath(command, cwd, env);
  if (resolved) return;
  if (command.includes("/") || command.includes("\\")) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    throw new Error(`Command is not executable: "${command}" (resolved: "${absolute}")`);
  }
  throw new Error(`Command not found in PATH: "${command}"`);
}

export async function runChildProcess(
  runId: string,
  command: string,
  args: string[],
  opts: {
    cwd: string;
    env: Record<string, string>;
    timeoutSec: number;
    graceSec: number;
    onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
    onLogError?: (err: unknown, runId: string, message: string) => void;
    onSpawn?: (meta: { pid: number; processGroupId: number | null; startedAt: string }) => Promise<void>;
    stdin?: string;
    terminalResultCleanup?: TerminalResultCleanupOptions;
  },
): Promise<RunProcessResult> {
  const onLogError = opts.onLogError ?? ((err, id, msg) => console.warn({ err, runId: id }, msg));

  return new Promise<RunProcessResult>((resolve, reject) => {
    const rawMerged: NodeJS.ProcessEnv = { ...process.env, ...opts.env };

    // Strip Claude Code nesting-guard env vars so spawned `claude` processes
    // don't refuse to start with "cannot be launched inside another session".
    // These vars leak in when the Paperclip server itself is started from
    // within a Claude Code session (e.g. `npx paperclipai run` in a terminal
    // owned by Claude Code) or when cron inherits a contaminated shell env.
    const CLAUDE_CODE_NESTING_VARS = [
      "CLAUDECODE",
      "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_CODE_SESSION",
      "CLAUDE_CODE_PARENT_SESSION",
    ] as const;
    for (const key of CLAUDE_CODE_NESTING_VARS) {
      delete rawMerged[key];
    }

    const mergedEnv = ensurePathInEnv(rawMerged);
    void resolveSpawnTarget(command, args, opts.cwd, mergedEnv)
      .then((target) => {
        const child = spawn(target.command, target.args, {
          cwd: opts.cwd,
          env: mergedEnv,
          detached: process.platform !== "win32",
          shell: false,
          stdio: [opts.stdin != null ? "pipe" : "ignore", "pipe", "pipe"],
        }) as ChildProcessWithEvents;
        const startedAt = new Date().toISOString();
        const processGroupId = resolveProcessGroupId(child);

        const spawnPersistPromise =
          typeof child.pid === "number" && child.pid > 0 && opts.onSpawn
            ? opts.onSpawn({ pid: child.pid, processGroupId, startedAt }).catch((err) => {
              onLogError(err, runId, "failed to record child process metadata");
            })
            : Promise.resolve();

        runningProcesses.set(runId, { child, graceSec: opts.graceSec, processGroupId });

        let timedOut = false;
        let stdout = "";
        let stderr = "";
        let logChain: Promise<void> = Promise.resolve();
        let childExited = false;
        let terminalResultSeen = false;
        let terminalResultCleanupTimer: NodeJS.Timeout | null = null;

        const clearTerminalResultCleanupTimer = () => {
          if (!terminalResultCleanupTimer) return;
          clearTimeout(terminalResultCleanupTimer);
          terminalResultCleanupTimer = null;
        };

        const maybeArmTerminalResultCleanup = () => {
          if (!opts.terminalResultCleanup || !terminalResultSeen || !childExited || !processGroupId) return;
          if (terminalResultCleanupTimer) return;
          terminalResultCleanupTimer = setTimeout(() => {
            signalRunningProcess({ child, processGroupId }, "SIGTERM");
            setTimeout(() => {
              signalRunningProcess({ child, processGroupId }, "SIGKILL");
            }, Math.max(1, opts.graceSec) * 1000);
          }, Math.max(0, opts.terminalResultCleanup.graceMs));
        };

        const recordOutput = (stream: "stdout" | "stderr", text: string) => {
          if (stream === "stdout") stdout = appendWithCap(stdout, text);
          else stderr = appendWithCap(stderr, text);
          if (opts.terminalResultCleanup && !terminalResultSeen) {
            const output = stream === "stdout" ? stdout : `${stdout}\n${stderr}`;
            terminalResultSeen = opts.terminalResultCleanup.hasTerminalResult(
              output.slice(-MAX_TERMINAL_RESULT_SCAN_BYTES),
            );
            maybeArmTerminalResultCleanup();
          }
        };

        const timeout =
          opts.timeoutSec > 0
            ? setTimeout(() => {
                timedOut = true;
                clearTerminalResultCleanupTimer();
                signalRunningProcess({ child, processGroupId }, "SIGTERM");
                setTimeout(() => {
                  signalRunningProcess({ child, processGroupId }, "SIGKILL");
                }, Math.max(1, opts.graceSec) * 1000);
              }, opts.timeoutSec * 1000)
            : null;

        child.stdout?.on("data", (chunk: unknown) => {
          const text = String(chunk);
          recordOutput("stdout", text);
          logChain = logChain
            .then(() => opts.onLog("stdout", text))
            .catch((err) => onLogError(err, runId, "failed to append stdout log chunk"));
        });

        child.stderr?.on("data", (chunk: unknown) => {
          const text = String(chunk);
          recordOutput("stderr", text);
          logChain = logChain
            .then(() => opts.onLog("stderr", text))
            .catch((err) => onLogError(err, runId, "failed to append stderr log chunk"));
        });

        const stdin = child.stdin;
        if (opts.stdin != null && stdin) {
          void spawnPersistPromise.finally(() => {
            if (child.killed || stdin.destroyed) return;
            stdin.write(opts.stdin as string);
            stdin.end();
          });
        }

        child.on("error", (err: Error) => {
          if (timeout) clearTimeout(timeout);
          clearTerminalResultCleanupTimer();
          runningProcesses.delete(runId);
          const errno = (err as NodeJS.ErrnoException).code;
          const pathValue = mergedEnv.PATH ?? mergedEnv.Path ?? "";
          const msg =
            errno === "ENOENT"
              ? `Failed to start command "${command}" in "${opts.cwd}". Verify adapter command, working directory, and PATH (${pathValue}).`
              : `Failed to start command "${command}" in "${opts.cwd}": ${err.message}`;
          reject(new Error(msg));
        });

        child.on("exit", () => {
          childExited = true;
          maybeArmTerminalResultCleanup();
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
          if (timeout) clearTimeout(timeout);
          clearTerminalResultCleanupTimer();
          runningProcesses.delete(runId);
          void logChain.finally(() => {
            resolve({
              exitCode: code,
              signal,
              timedOut,
              stdout,
              stderr,
              pid: child.pid ?? null,
              startedAt,
            });
          });
        });
      })
      .catch(reject);
  });
}
