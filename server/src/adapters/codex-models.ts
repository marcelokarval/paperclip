import { spawnSync } from "node:child_process";
import type { AdapterModel } from "./types.js";
import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";

const CODEX_MODELS_TIMEOUT_MS = 5_000;
const CODEX_MODELS_CACHE_TTL_MS = 60_000;
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;

let cached: { expiresAt: number; models: AdapterModel[] } | null = null;

type CodexModelsCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  hasError: boolean;
};

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function mergedWithFallback(models: AdapterModel[]): AdapterModel[] {
  return dedupeModels([...models, ...codexFallbackModels])
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function modelLabel(entry: Record<string, unknown>, id: string): string {
  return asString(entry.display_name) ?? asString(entry.label) ?? asString(entry.name) ?? id;
}

export function parseCodexModelsOutput(stdout: string): AdapterModel[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rawModels = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).models
      : parsed;
    if (!Array.isArray(rawModels)) return [];

    const models: AdapterModel[] = [];
    for (const raw of rawModels) {
      if (typeof raw === "string") {
        models.push({ id: raw, label: raw });
        continue;
      }
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      const id = asString(entry.slug) ?? asString(entry.id) ?? asString(entry.model);
      if (!id) continue;
      models.push({ id, label: modelLabel(entry, id) });
    }
    return dedupeModels(models);
  } catch {
    return [];
  }
}

function defaultCodexModelsRunner(): CodexModelsCommandResult {
  const result = spawnSync("codex", ["debug", "models"], {
    encoding: "utf8",
    timeout: CODEX_MODELS_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    hasError: Boolean(result.error),
  };
}

let codexModelsRunner: () => CodexModelsCommandResult = defaultCodexModelsRunner;

function fetchCodexModelsFromCli(): AdapterModel[] {
  const result = codexModelsRunner();
  if (result.hasError || (result.status ?? 1) !== 0) return [];
  return parseCodexModelsOutput(result.stdout);
}

export async function listCodexModels(options: { refresh?: boolean } = {}): Promise<AdapterModel[]> {
  const now = Date.now();
  if (!options.refresh && cached && cached.expiresAt > now) {
    return cached.models;
  }

  const discovered = fetchCodexModelsFromCli();
  if (discovered.length > 0) {
    const merged = mergedWithFallback(discovered);
    cached = {
      expiresAt: now + CODEX_MODELS_CACHE_TTL_MS,
      models: merged,
    };
    return merged;
  }

  if (!options.refresh && cached && cached.models.length > 0) {
    return cached.models;
  }

  return dedupeModels(codexFallbackModels);
}

export function resetCodexModelsCacheForTests() {
  cached = null;
}

export function setCodexModelsRunnerForTests(runner: (() => CodexModelsCommandResult) | null) {
  codexModelsRunner = runner ?? defaultCodexModelsRunner;
}
