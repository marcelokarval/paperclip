import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
  type RepositoryDocumentationBaseline,
  type RepositoryDocumentationBaselineDoc,
  type RepositoryBaselineAnalyzerResult,
  type RepositoryBaselineIssuePolicyRecommendation,
  type RepositoryBaselineProjectDefaultsRecommendation,
  type RepositoryBaselineRecommendations,
  type RepositoryBaselineSuggestedLabel,
  type RepositoryDocumentationBaselineStatus,
  repositoryBaselineOwnershipAreaSchema,
  repositoryBaselineSuggestedLabelSchema,
} from "@paperclipai/shared";

export type RepositoryBaselineWorkspaceInput = {
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
};

const MAX_DOC_FILES = 32;
const MAX_DOC_BYTES = 128 * 1024;
const MAX_ANALYZER_OUTPUT_BYTES = 256 * 1024;
const MAX_ANALYZER_RAW_OUTPUT_CHARS = 4_000;
const DEFAULT_ANALYZER_TIMEOUT_MS = 90_000;
const ROOT_CANDIDATES = [
  "README.md",
  "README.mdx",
  "AGENTS.md",
  "CLAUDE.md",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "vite.config.ts",
  "vite.config.js",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".github/copilot-instructions.md",
];
const DOC_DIRS = ["doc", "docs", ".cursor/rules"];
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"]);
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".venv",
  "vendor",
]);
const ANALYZER_FIELD_KEYS = [
  "architectureSummary",
  "stackCorrections",
  "suggestedLabels",
  "canonicalDocs",
  "ownershipAreas",
  "verificationCommands",
  "agentGuidance",
  "risks",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.map((entry) => typeof entry === "string" ? entry : ""));
}

function relativeSafePath(root: string, candidate: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(root, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolvedCandidate;
}

async function isReadableRegularFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_DOC_BYTES;
  } catch {
    return false;
  }
}

async function collectDocCandidates(root: string): Promise<string[]> {
  const candidates: string[] = [];

  for (const relativePath of ROOT_CANDIDATES) {
    const filePath = relativeSafePath(root, relativePath);
    if (filePath && await isReadableRegularFile(filePath)) {
      candidates.push(relativePath);
    }
  }

  for (const docDir of DOC_DIRS) {
    const absoluteDir = relativeSafePath(root, docDir);
    if (!absoluteDir) continue;
    await collectDocsFromDir({
      root,
      absoluteDir,
      candidates,
      depth: 0,
    });
  }

  return unique(candidates).slice(0, MAX_DOC_FILES);
}

async function collectDocsFromDir(input: {
  root: string;
  absoluteDir: string;
  candidates: string[];
  depth: number;
}) {
  if (input.candidates.length >= MAX_DOC_FILES || input.depth > 2) return;

  try {
    const stat = await fs.lstat(input.absoluteDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    const entries = await fs.readdir(input.absoluteDir, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (input.candidates.length >= MAX_DOC_FILES) return;
      if (entry.name.startsWith(".") && input.absoluteDir.endsWith(`${path.sep}.cursor${path.sep}rules`) === false) {
        continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await collectDocsFromDir({
          root: input.root,
          absoluteDir: path.join(input.absoluteDir, entry.name),
          candidates: input.candidates,
          depth: input.depth + 1,
        });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!DOC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      const absoluteFile = path.join(input.absoluteDir, entry.name);
      if (!await isReadableRegularFile(absoluteFile)) continue;
      const relative = path.relative(path.resolve(input.root), absoluteFile);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      input.candidates.push(relative);
    }
  } catch {
    return;
  }
}

function detectDocKind(relativePath: string): RepositoryDocumentationBaselineDoc["kind"] {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("agent") || normalized === "claude.md" || normalized.includes("copilot-instructions") || normalized.startsWith(".cursor/rules/")) {
    return "agent_instructions";
  }
  if (normalized.includes("product") || normalized.includes("goal")) return "product";
  if (normalized.includes("architecture") || normalized.includes("adr") || normalized.includes("spec")) return "architecture";
  if (normalized.includes("develop") || normalized.includes("database")) return "development";
  if (normalized === "readme.md" || normalized === "readme.mdx") return "readme";
  if (normalized.endsWith(".json") || normalized.endsWith(".yaml") || normalized.endsWith(".yml") || normalized.endsWith(".toml")) return "config";
  return "other";
}

function firstContentLine(content: string): string | null {
  const line = content
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry.length > 0);
  if (!line) return null;
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}

function hasDependency(dependencyNames: Set<string>, names: string[]) {
  return names.some((name) => dependencyNames.has(name));
}

function detectStackFromPackageJson(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as {
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const dependencyNames = new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ]);
    const stack: string[] = ["JavaScript"];
    if (dependencyNames.has("typescript")) stack.push("TypeScript");
    if (dependencyNames.has("react")) stack.push("React");
    if (dependencyNames.has("next")) stack.push("Next.js");
    if (dependencyNames.has("vite")) stack.push("Vite");
    if (dependencyNames.has("express")) stack.push("Express");
    if (dependencyNames.has("drizzle-orm")) stack.push("Drizzle");
    if (dependencyNames.has("postgres")) stack.push("PostgreSQL");
    if (hasDependency(dependencyNames, ["bullmq"])) stack.push("BullMQ");
    if (hasDependency(dependencyNames, ["ioredis", "redis"])) stack.push("Redis");
    if (hasDependency(dependencyNames, ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"])) stack.push("S3-compatible storage");
    if (hasDependency(dependencyNames, ["zod"])) stack.push("Zod");
    if (hasDependency(dependencyNames, ["tailwindcss", "@tailwindcss/postcss"])) stack.push("Tailwind CSS");
    if (hasDependency(dependencyNames, ["file-type", "mime-types"])) stack.push("Upload validation");
    if (dependencyNames.has("vitest")) stack.push("Vitest");
    if (dependencyNames.has("@playwright/test")) stack.push("Playwright");
    for (const scriptName of Object.keys(parsed.scripts ?? {})) {
      if (
        ["test", "typecheck", "build", "dev", "start"].includes(scriptName)
        || scriptName.startsWith("jobs:")
        || scriptName.startsWith("proof:")
        || scriptName.startsWith("db:")
      ) {
        stack.push(`npm script: ${scriptName}`);
      }
    }
    return stack;
  } catch {
    return ["JavaScript"];
  }
}

function detectStack(relativePath: string, content: string): string[] {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  if (normalized === "package.json") return detectStackFromPackageJson(content);
  if (normalized === "pnpm-workspace.yaml" || normalized === "pnpm-lock.yaml") return ["pnpm"];
  if (normalized === "tsconfig.json") return ["TypeScript"];
  if (normalized === "pyproject.toml" || normalized === "requirements.txt") return ["Python"];
  if (normalized === "cargo.toml") return ["Rust"];
  if (normalized === "go.mod") return ["Go"];
  if (normalized.startsWith("vite.config.")) return ["Vite"];
  if (normalized.startsWith("docker")) return ["Docker"];
  return [];
}

async function pathExists(root: string, relativePath: string): Promise<boolean> {
  const filePath = relativeSafePath(root, relativePath);
  if (!filePath) return false;
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectStackFromWorkspaceStructure(root: string): Promise<string[]> {
  const checks: Array<[string, string]> = [
    ["src/app", "Next.js App Router"],
    ["src/app/api", "Next.js API routes"],
    ["src/server", "Server modules"],
    ["src/server/db", "Server database layer"],
    ["src/server/jobs", "Background jobs"],
    ["src/server/storage", "Storage layer"],
    ["src/server/integrations", "External integrations"],
    ["src/server/auth", "Authentication/session"],
    ["src/server/security", "Security layer"],
    ["src/server/validation", "Validation layer"],
    ["src/server/events", "Domain events"],
    ["src/server/cache", "Cache layer"],
    ["tests", "Test suite"],
    ["vitest.config.ts", "Vitest"],
    ["tailwind.config.ts", "Tailwind CSS"],
    ["tailwind.config.js", "Tailwind CSS"],
  ];
  const detected: string[] = [];
  for (const [relativePath, signal] of checks) {
    if (await pathExists(root, relativePath)) detected.push(signal);
  }
  return detected;
}

const LABEL_PALETTE: Record<string, string> = {
  frontend: "#2563eb",
  backend: "#16a34a",
  database: "#7c3aed",
  adapter: "#ea580c",
  docs: "#64748b",
  security: "#dc2626",
  qa: "#0891b2",
  devops: "#4f46e5",
  nextjs: "#111827",
  jobs: "#0f766e",
  storage: "#9333ea",
  integrations: "#c2410c",
  auth: "#be123c",
  validation: "#ca8a04",
  runtime: "#475569",
};

function includesAny(values: string[], candidates: string[]) {
  const normalized = values.map((value) => value.toLowerCase());
  return candidates.some((candidate) => normalized.some((value) => value.includes(candidate)));
}

function pushSuggestedLabel(
  labels: Map<string, RepositoryBaselineSuggestedLabel>,
  input: RepositoryBaselineSuggestedLabel,
) {
  const existing = labels.get(input.name);
  if (!existing) {
    labels.set(input.name, input);
    return;
  }
  labels.set(input.name, {
    ...existing,
    evidence: unique([...existing.evidence, ...input.evidence]),
    confidence: existing.confidence === "high" || input.confidence === "high"
      ? "high"
      : existing.confidence === "medium" || input.confidence === "medium"
        ? "medium"
        : "low",
  });
}

function buildSuggestedLabels(input: {
  docs: RepositoryDocumentationBaselineDoc[];
  stack: string[];
}): RepositoryBaselineSuggestedLabel[] {
  const labels = new Map<string, RepositoryBaselineSuggestedLabel>();
  const paths = input.docs.map((doc) => doc.path.replace(/\\/g, "/").toLowerCase());
  const stack = input.stack.map((entry) => entry.toLowerCase());

  const add = (
    name: string,
    description: string,
    evidence: string[],
    confidence: RepositoryBaselineSuggestedLabel["confidence"] = "medium",
  ) => pushSuggestedLabel(labels, {
    name,
    color: LABEL_PALETTE[name] ?? "#64748b",
    description,
    evidence: unique(evidence),
    confidence,
  });

  if (includesAny(paths, ["ui/", "src/components", "src/pages", "src/app"]) || includesAny(stack, ["react", "vite", "next.js"])) {
    add("frontend", "UI, client-side routing, React components, layouts, and browser-visible behavior.", [
      ...input.stack.filter((entry) => ["React", "Vite", "Next.js", "Next.js App Router"].includes(entry)),
      ...input.docs.filter((doc) => doc.path.toLowerCase().startsWith("ui/")).slice(0, 3).map((doc) => doc.path),
    ], "high");
  }
  if (includesAny(stack, ["next.js"])) {
    add("nextjs", "Next.js application runtime, App Router, server/client boundaries, and route handlers.", [
      ...input.stack.filter((entry) => entry.includes("Next.js")),
    ], "high");
  }
  if (includesAny(paths, ["server/", "routes", "services"]) || includesAny(stack, ["express", "server modules", "next.js api routes"])) {
    add("backend", "API routes, orchestration services, server-side validation, and control-plane behavior.", [
      ...input.stack.filter((entry) => ["Express", "Server modules", "Next.js API routes"].includes(entry)),
      ...input.docs.filter((doc) => doc.path.toLowerCase().startsWith("server/")).slice(0, 3).map((doc) => doc.path),
    ], "high");
  }
  if (includesAny(paths, ["database", "migration", "schema", "packages/db"]) || includesAny(stack, ["drizzle", "postgresql", "server database layer"])) {
    add("database", "Schema, migrations, persistence contracts, and data integrity behavior.", [
      ...input.stack.filter((entry) => ["Drizzle", "PostgreSQL", "Server database layer"].includes(entry)),
      ...input.docs.filter((doc) => /database|schema|migration|packages\/db/i.test(doc.path)).slice(0, 3).map((doc) => doc.path),
    ], "medium");
  }
  if (includesAny(stack, ["bullmq", "redis", "background jobs"]) || includesAny(paths, ["jobs", "queue", "worker", "scheduler"])) {
    add("jobs", "Background jobs, queues, workers, schedules, retry behavior, and asynchronous processing.", [
      ...input.stack.filter((entry) => ["BullMQ", "Redis", "Background jobs"].includes(entry) || entry.startsWith("npm script: jobs:")),
      ...input.docs.filter((doc) => /jobs?|queue|worker|schedule/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 4).map((doc) => doc.path),
    ], "high");
  }
  if (includesAny(stack, ["s3-compatible storage", "storage layer", "upload validation"]) || includesAny(paths, ["storage", "upload", "file"])) {
    add("storage", "File storage, upload validation, private exports, local/S3 adapters, and signed URL behavior.", [
      ...input.stack.filter((entry) => ["S3-compatible storage", "Storage layer", "Upload validation"].includes(entry)),
      ...input.docs.filter((doc) => /storage|upload|file|download/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 4).map((doc) => doc.path),
    ], "high");
  }
  if (includesAny(stack, ["external integrations"]) || includesAny(paths, ["integrations", "webhook", "stripe", "telnyx", "skiptrace"])) {
    add("integrations", "External service clients, provider contracts, webhook boundaries, and integration resilience.", [
      ...input.stack.filter((entry) => entry === "External integrations"),
      ...input.docs.filter((doc) => /integration|provider|webhook|stripe|telnyx|skiptrace/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 4).map((doc) => doc.path),
    ], "medium");
  }
  if (includesAny(stack, ["authentication/session"]) || includesAny(paths, ["auth", "session"])) {
    add("auth", "Authentication, sessions, identity boundaries, login state, and user-context behavior.", [
      ...input.stack.filter((entry) => entry === "Authentication/session"),
      ...input.docs.filter((doc) => /auth|session|identity/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 4).map((doc) => doc.path),
    ], "medium");
  }
  if (includesAny(stack, ["zod", "validation layer", "upload validation"]) || includesAny(paths, ["validation", "validators", "schema"])) {
    add("validation", "Input validation, schema parsing, boundary contracts, and untrusted data handling.", [
      ...input.stack.filter((entry) => ["Zod", "Validation layer", "Upload validation"].includes(entry)),
      ...input.docs.filter((doc) => /validation|schema|contract/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 4).map((doc) => doc.path),
    ], "medium");
  }
  if (includesAny(paths, ["packages/adapters", "adapter"]) || includesAny(input.docs.map((doc) => doc.summary ?? ""), ["adapter"])) {
    add("adapter", "Agent adapter integrations, invocation contracts, runtime environment, and model-specific behavior.", [
      ...input.docs.filter((doc) => /adapter/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 3).map((doc) => doc.path),
    ], "medium");
  }
  if (input.docs.some((doc) => doc.kind === "agent_instructions" || doc.kind === "readme" || doc.kind === "architecture")) {
    add("docs", "Documentation, repository operating instructions, product specs, and architecture notes.", [
      ...input.docs.filter((doc) => ["agent_instructions", "readme", "architecture"].includes(doc.kind)).slice(0, 4).map((doc) => doc.path),
    ], "high");
  }
  if (includesAny(paths, ["auth", "security", "secrets", "sandbox"]) || includesAny(stack, ["security layer", "authentication/session"]) || includesAny(input.docs.map((doc) => doc.summary ?? ""), ["auth", "security", "secret", "sandbox"])) {
    add("security", "Authentication, authorization, sandboxing, secrets, untrusted input, and privilege boundaries.", [
      ...input.stack.filter((entry) => ["Security layer", "Authentication/session"].includes(entry)),
      ...input.docs.filter((doc) => /auth|security|secret|sandbox/i.test(`${doc.path} ${doc.summary ?? ""}`)).slice(0, 4).map((doc) => doc.path),
    ], "medium");
  }
  if (includesAny(stack, ["vitest", "playwright"]) || includesAny(paths, ["test", "spec", "playwright"])) {
    add("qa", "Tests, verification flows, browser proof, release smoke checks, and regression coverage.", [
      ...input.stack.filter((entry) => ["Vitest", "Playwright"].includes(entry)),
      ...input.docs.filter((doc) => /test|spec|playwright/i.test(doc.path)).slice(0, 3).map((doc) => doc.path),
    ], "high");
  }
  if (includesAny(paths, ["docker", "deploy", ".github", "workflow"]) || includesAny(stack, ["docker"])) {
    add("devops", "Deployment, CI, local runtime, containers, and operational scripts.", [
      ...input.stack.filter((entry) => entry === "Docker"),
      ...input.docs.filter((doc) => /docker|deploy|\.github|workflow/i.test(doc.path)).slice(0, 3).map((doc) => doc.path),
    ], "medium");
  }

  return [...labels.values()].filter((label) => label.evidence.length > 0);
}

function buildIssuePolicyRecommendation(labels: RepositoryBaselineSuggestedLabel[]): RepositoryBaselineIssuePolicyRecommendation {
  const labelNames = labels.map((label) => label.name);
  return {
    parentChildGuidance: [
      "Use parentId only when decomposing an explicitly assigned issue into direct execution subtasks.",
      "Do not create child issues from a repository baseline by default; keep baseline review concentrated in the tracking issue.",
      "Use inheritExecutionWorkspaceFromIssueId for follow-up work that must stay attached to the same checkout/worktree.",
    ],
    blockingGuidance: [
      "Use blockedByIssueIds only when the issue cannot progress until another concrete issue is completed.",
      "Do not use blockers as a generic related-issue link; explain the blocking condition in the issue comment.",
      "Move an issue to blocked only when the blocker is specific and actionable.",
    ],
    labelUsageGuidance: labelNames.length > 0
      ? labels.map((label) => `Use ${label.name} when: ${label.description}`)
      : ["Use labels only when the label meaning is clear from project guidance or operator instruction."],
    reviewGuidance: [
      "Use review stages for technical correctness checks before an issue is considered complete.",
      "Prefer review for code, architecture, verification, or integration risk; keep reviewer work separate from executor work.",
    ],
    approvalGuidance: [
      "Use approval stages for operator/business decisions, sensitive configuration, or irreversible workflow changes.",
      "Do not treat approval as a second technical review; it is a decision gate.",
    ],
  };
}

function buildProjectDefaultsRecommendation(input: {
  docs: RepositoryDocumentationBaselineDoc[];
  stack: string[];
  labels: RepositoryBaselineSuggestedLabel[];
}): RepositoryBaselineProjectDefaultsRecommendation {
  const canonicalDocs = input.docs
    .filter((doc) => ["agent_instructions", "readme", "product", "architecture", "development"].includes(doc.kind))
    .map((doc) => doc.path)
    .slice(0, 12);
  const stack = new Set(input.stack);
  const suggestedVerificationCommands = unique([
    stack.has("TypeScript") ? "pnpm -r typecheck" : "",
    stack.has("Vitest") ? "pnpm test:run" : "",
    stack.has("Playwright") ? "pnpm test:e2e" : "",
    stack.has("JavaScript") || stack.has("TypeScript") ? "pnpm build" : "",
  ]);
  const ownershipAreas: RepositoryBaselineProjectDefaultsRecommendation["ownershipAreas"] = [];
  const addArea = (name: string, paths: string[], recommendedLabels: string[], stackSignals: string[] = []) => {
    const existingPaths = paths.filter((candidate) =>
      input.docs.some((doc) => doc.path.toLowerCase().startsWith(candidate.toLowerCase()))
      || input.docs.some((doc) => doc.path.toLowerCase() === candidate.toLowerCase())
    );
    for (const signal of stackSignals) {
      if (input.stack.includes(signal) && !existingPaths.includes(signal)) {
        existingPaths.push(signal);
      }
    }
    if (existingPaths.length > 0) {
      ownershipAreas.push({ name, paths: existingPaths, recommendedLabels });
    }
  };

  addArea("Frontend", ["ui/", "src/app", "src/components", "src/pages"], ["frontend", "nextjs", "qa"], ["Next.js App Router"]);
  addArea("Backend", ["server/", "src/server", "src/app/api"], ["backend", "nextjs", "qa"], ["Server modules", "Next.js API routes"]);
  addArea("Database", ["packages/db/", "doc/DATABASE.md"], ["database", "backend"], ["Drizzle", "PostgreSQL", "Server database layer"]);
  addArea("Adapters", ["packages/adapters/"], ["adapter", "backend"]);
  addArea("Jobs", ["src/server/jobs", "scripts/"], ["jobs", "backend"], ["BullMQ", "Redis", "Background jobs"]);
  addArea("Storage", ["src/server/storage", "src/server/uploads"], ["storage", "security"], ["S3-compatible storage", "Storage layer"]);
  addArea("Integrations", ["src/server/integrations"], ["integrations", "backend"], ["External integrations"]);
  addArea("Authentication", ["src/server/auth", "src/server/security"], ["auth", "security"], ["Authentication/session", "Security layer"]);
  addArea("Validation", ["src/server/validation"], ["validation", "security"], ["Zod", "Validation layer"]);
  addArea("Documentation", ["AGENTS.md", "CLAUDE.md", "README.md", "doc/", "docs/"], ["docs"]);

  return {
    canonicalDocs,
    suggestedVerificationCommands,
    ownershipAreas: ownershipAreas.filter((area) =>
      area.recommendedLabels.some((label) => input.labels.some((candidate) => candidate.name === label)),
    ),
  };
}

function buildRecommendations(input: {
  docs: RepositoryDocumentationBaselineDoc[];
  stack: string[];
}): RepositoryBaselineRecommendations {
  const labels = buildSuggestedLabels(input);
  return {
    labels,
    issuePolicy: buildIssuePolicyRecommendation(labels),
    projectDefaults: buildProjectDefaultsRecommendation({ ...input, labels }),
  };
}

type RepositoryBaselineAnalyzerOutput = {
  architectureSummary: string | null;
  stackCorrections: string[];
  suggestedLabels: RepositoryBaselineSuggestedLabel[];
  canonicalDocs: string[];
  ownershipAreas: RepositoryBaselineProjectDefaultsRecommendation["ownershipAreas"];
  verificationCommands: string[];
  agentGuidance: string[];
  risks: string[];
};

type RepositoryBaselineAnalyzerConfig = {
  provider: RepositoryBaselineAnalyzerResult["provider"];
  command: string;
  args: string[];
  model: string | null;
  timeoutMs: number;
};

function parseAnalyzerArgs(value: string | undefined): string[] | null {
  if (!value || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
    // Fall back to whitespace splitting for simple local commands.
  }
  return value.split(/\s+/).map((entry) => entry.trim()).filter(Boolean);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 5 * 60_000);
}

function resolveAnalyzerConfig(): RepositoryBaselineAnalyzerConfig {
  const customCommand = asString(process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND);
  if (customCommand) {
    return {
      provider: "custom_command",
      command: customCommand,
      args: parseAnalyzerArgs(process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS) ?? [],
      model: asString(process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_MODEL),
      timeoutMs: readPositiveInt(
        process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS,
        DEFAULT_ANALYZER_TIMEOUT_MS,
      ),
    };
  }

  const command = asString(process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND) ?? "codex";
  const model = asString(process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_MODEL);
  const args = parseAnalyzerArgs(process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_ARGS) ?? [
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-c",
    'model_reasoning_effort="low"',
    "-",
  ];
  if (model && !args.includes("--model")) {
    args.splice(args.length - 1, 0, "--model", model);
  }
  return {
    provider: "codex_local",
    command,
    args,
    model,
    timeoutMs: readPositiveInt(
      process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS,
      DEFAULT_ANALYZER_TIMEOUT_MS,
    ),
  };
}

function buildAnalyzerPrompt(baseline: RepositoryDocumentationBaseline): string {
  const payload = {
    repository: baseline.repository ?? null,
    summary: baseline.summary,
    stack: baseline.stack,
    documentationFiles: baseline.documentationFiles,
    docs: baseline.docs ?? [],
    gaps: baseline.gaps ?? [],
    deterministicRecommendations: baseline.recommendations ?? null,
    constraints: baseline.constraints ?? {
      repositoryWritesAllowed: false,
      backlogGenerationAllowed: false,
      childIssuesAllowed: false,
      agentWakeupAllowed: false,
    },
  };
  return [
    "You are Paperclip's repository-baseline analyzer.",
    "Analyze only the JSON context below. Do not inspect the filesystem. Do not create issues, child issues, PRs, files, commits, or agent tasks.",
    "Return exactly one JSON object with this shape:",
    "{",
    '  "architectureSummary": "short repository architecture summary or null",',
    '  "stackCorrections": ["extra stack signals"],',
    '  "suggestedLabels": [{"name":"label","color":"#64748b","description":"when to use it","evidence":["signal"],"confidence":"low|medium|high"}],',
    '  "canonicalDocs": ["path/to/doc.md"],',
    '  "ownershipAreas": [{"name":"Area","paths":["src/area"],"recommendedLabels":["label"]}],',
    '  "verificationCommands": ["command"],',
    '  "agentGuidance": ["short guidance future agents should follow"],',
    '  "risks": ["important missing context or ambiguity"]',
    "}",
    "Keep output compact. Do not wrap it in markdown.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

function trimOutput(value: string, maxBytes = MAX_ANALYZER_OUTPUT_BYTES): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  return value.slice(-maxBytes);
}

function normalizeAnalyzerRawOutput(output: string | null | undefined): string | null {
  if (!output) return null;
  const normalized = output
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_ANALYZER_RAW_OUTPUT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_ANALYZER_RAW_OUTPUT_CHARS)}\n...[truncated]`;
}

function extractEnvelopeTextCandidates(value: unknown): string[] {
  const candidates = new Set<string>();
  const visit = (entry: unknown) => {
    const text = asString(entry);
    if (text) {
      candidates.add(text);
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    const record = asRecord(entry);
    if (!Object.keys(record).length) return;
    for (const key of ["text", "summary", "result"]) {
      const value = asString(record[key]);
      if (value) candidates.add(value);
    }
    const recordType = asString(record.type);
    if (recordType && ["output_text", "text", "content"].includes(recordType)) {
      const text = asString(record.content) ?? asString(record.text);
      if (text) candidates.add(text);
    }
    for (const key of ["item", "message", "content", "parts"]) {
      if (key in record) visit(record[key]);
    }
  };
  visit(value);
  return [...candidates];
}

function extractJsonObjectText(output: string): string | null {
  const cleaned = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    try {
      const parsed = asRecord(JSON.parse(cleaned));
      const hasAnalyzerFields = ANALYZER_FIELD_KEYS.some((key) => key in parsed);
      if (hasAnalyzerFields) return cleaned;

      for (const wrappedText of extractEnvelopeTextCandidates(parsed)) {
        const nested = extractJsonObjectText(wrappedText);
        if (nested) return nested;
      }
    } catch {
      // Multi-line JSONL/event output can still start and end with braces.
      // Fall through to line-wise extraction before giving up.
    }
  }

  const lines = cleaned.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsedLine = JSON.parse(line) as unknown;
      for (const text of extractEnvelopeTextCandidates(parsedLine)) {
        const nested = extractJsonObjectText(text);
        if (nested) return nested;
      }
    } catch {
      // Not a JSONL wrapper line.
    }
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function parseAnalyzerOutput(output: string): RepositoryBaselineAnalyzerOutput | null {
  const jsonText = extractJsonObjectText(output);
  if (!jsonText) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(jsonText));
  } catch {
    return null;
  }
  if (!ANALYZER_FIELD_KEYS.some((key) => key in parsed)) return null;

  const labels = Array.isArray(parsed.suggestedLabels)
    ? parsed.suggestedLabels
        .map((entry) => repositoryBaselineSuggestedLabelSchema.safeParse(entry))
        .filter((entry): entry is typeof entry & { success: true } => entry.success)
        .map((entry) => entry.data)
    : [];
  const ownershipAreas = Array.isArray(parsed.ownershipAreas)
    ? parsed.ownershipAreas
        .map((entry) => repositoryBaselineOwnershipAreaSchema.safeParse(entry))
        .filter((entry): entry is typeof entry & { success: true } => entry.success)
        .map((entry) => entry.data)
    : [];

  return {
    architectureSummary: asString(parsed.architectureSummary),
    stackCorrections: asStringArray(parsed.stackCorrections).slice(0, 24),
    suggestedLabels: labels.slice(0, 24),
    canonicalDocs: asStringArray(parsed.canonicalDocs).slice(0, 24),
    ownershipAreas: ownershipAreas.slice(0, 24),
    verificationCommands: asStringArray(parsed.verificationCommands).slice(0, 24),
    agentGuidance: asStringArray(parsed.agentGuidance).slice(0, 24),
    risks: asStringArray(parsed.risks).slice(0, 24),
  };
}

function mergeAnalyzerOutput(
  baseline: RepositoryDocumentationBaseline,
  output: RepositoryBaselineAnalyzerOutput,
): { baseline: RepositoryDocumentationBaseline; appliedChanges: string[]; noOpReason: string | null } {
  const recommendations = baseline.recommendations ?? buildRecommendations({
    docs: baseline.docs ?? [],
    stack: baseline.stack,
  });
  const previousSummary = baseline.summary ?? null;
  const previousStack = new Set(baseline.stack);
  const previousGaps = new Set(baseline.gaps ?? []);
  const previousLabels = new Set(recommendations.labels.map((label) => label.name));
  const previousCanonicalDocs = new Set(recommendations.projectDefaults.canonicalDocs);
  const previousVerificationCommands = new Set(recommendations.projectDefaults.suggestedVerificationCommands);
  const previousOwnershipAreas = new Set(recommendations.projectDefaults.ownershipAreas.map((area) => area.name));
  const previousReviewGuidance = new Set(recommendations.issuePolicy.reviewGuidance);
  const labelsByName = new Map<string, RepositoryBaselineSuggestedLabel>();
  for (const label of recommendations.labels) labelsByName.set(label.name, label);
  for (const label of output.suggestedLabels) pushSuggestedLabel(labelsByName, label);

  const canonicalDocs = unique([
    ...recommendations.projectDefaults.canonicalDocs,
    ...output.canonicalDocs.filter((doc) => baseline.documentationFiles.includes(doc)),
  ]);
  const suggestedVerificationCommands = unique([
    ...recommendations.projectDefaults.suggestedVerificationCommands,
    ...output.verificationCommands,
  ]);
  const ownershipAreas = [
    ...recommendations.projectDefaults.ownershipAreas,
    ...output.ownershipAreas,
  ];
  const agentGuidance = output.agentGuidance.map((entry) => `Analyzer guidance: ${entry}`);
  const risks = output.risks.map((entry) => `Analyzer risk: ${entry}`);

  const nextBaseline: RepositoryDocumentationBaseline = {
    ...baseline,
    summary: output.architectureSummary
      ? `${baseline.summary ?? "Repository baseline."} | AI analysis: ${output.architectureSummary}`
      : baseline.summary,
    stack: unique([...baseline.stack, ...output.stackCorrections]),
    gaps: unique([...(baseline.gaps ?? []), ...risks]),
    recommendations: {
      labels: [...labelsByName.values()],
      issuePolicy: {
        ...recommendations.issuePolicy,
        reviewGuidance: unique([
          ...recommendations.issuePolicy.reviewGuidance,
          ...agentGuidance,
        ]),
      },
      projectDefaults: {
        canonicalDocs,
        suggestedVerificationCommands,
        ownershipAreas,
      },
    },
  };
  const nextRecommendations = nextBaseline.recommendations ?? recommendations;
  const appliedChanges: string[] = [];
  const addedStackSignals = nextBaseline.stack.filter((entry) => !previousStack.has(entry));
  const addedLabels = nextRecommendations.labels.map((label) => label.name).filter((name) => !previousLabels.has(name));
  const addedCanonicalDocs = nextRecommendations.projectDefaults.canonicalDocs.filter((entry) => !previousCanonicalDocs.has(entry));
  const addedVerificationCommands = nextRecommendations.projectDefaults.suggestedVerificationCommands
    .filter((entry) => !previousVerificationCommands.has(entry));
  const addedOwnershipAreas = nextRecommendations.projectDefaults.ownershipAreas
    .map((area) => area.name)
    .filter((name) => !previousOwnershipAreas.has(name));
  const addedRisks = (nextBaseline.gaps ?? []).filter((entry) => !previousGaps.has(entry));
  const addedReviewGuidance = nextRecommendations.issuePolicy.reviewGuidance
    .filter((entry) => !previousReviewGuidance.has(entry) && entry.startsWith("Analyzer guidance: "));

  if (nextBaseline.summary !== previousSummary) {
    appliedChanges.push("Updated repository summary with AI architecture analysis.");
  }
  if (addedStackSignals.length > 0) appliedChanges.push(`Added stack signals: ${addedStackSignals.join(", ")}`);
  if (addedLabels.length > 0) appliedChanges.push(`Added suggested labels: ${addedLabels.join(", ")}`);
  if (addedCanonicalDocs.length > 0) appliedChanges.push(`Added canonical docs: ${addedCanonicalDocs.join(", ")}`);
  if (addedVerificationCommands.length > 0) {
    appliedChanges.push(`Added verification commands: ${addedVerificationCommands.join(", ")}`);
  }
  if (addedOwnershipAreas.length > 0) appliedChanges.push(`Added ownership areas: ${addedOwnershipAreas.join(", ")}`);
  if (addedReviewGuidance.length > 0) appliedChanges.push(`Added agent guidance: ${addedReviewGuidance.join(", ")}`);
  if (addedRisks.length > 0) appliedChanges.push(`Added analyzer risks to gaps: ${addedRisks.join(", ")}`);

  return {
    baseline: nextBaseline,
    appliedChanges,
    noOpReason: appliedChanges.length === 0
      ? "Analyzer completed but did not produce any material baseline changes."
      : null,
  };
}

async function runRepositoryBaselineAnalyzer(
  baseline: RepositoryDocumentationBaseline,
): Promise<RepositoryDocumentationBaseline> {
  const config = resolveAnalyzerConfig();
  const startedAt = Date.now();
  const ranAt = new Date().toISOString();
  const prompt = buildAnalyzerPrompt(baseline);

  const finish = (
    analysis: Omit<RepositoryBaselineAnalyzerResult, "provider" | "command" | "model" | "ranAt" | "durationMs">,
    nextBaseline: RepositoryDocumentationBaseline = baseline,
  ): RepositoryDocumentationBaseline => ({
    ...nextBaseline,
    analysis: {
      provider: config.provider,
      command: config.command,
      model: config.model,
      ranAt,
      durationMs: Date.now() - startedAt,
      ...analysis,
    },
  });

  let stdout = "";
  let stderr = "";
  try {
    const proc = spawn(config.command, config.args, {
      cwd: os.tmpdir(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => proc.kill("SIGTERM"), config.timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout = trimOutput(stdout + chunk.toString("utf8"));
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = trimOutput(stderr + chunk.toString("utf8"), 64 * 1024);
    });
    proc.stdin?.end(prompt);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      proc.once("error", reject);
      proc.once("close", (code) => resolve(code));
    });
    clearTimeout(timer);

    const timedOut = Date.now() - startedAt >= config.timeoutMs && exitCode !== 0;
    if (timedOut) {
      return finish({
        status: "timed_out",
        summary: null,
        risks: [],
        agentGuidance: [],
        error: "Repository baseline analyzer timed out.",
        changes: {
          appliedChanges: [],
          noOpReason: null,
        },
        rawOutput: normalizeAnalyzerRawOutput(stderr || stdout),
      });
    }
    if (exitCode !== 0) {
      return finish({
        status: "failed",
        summary: null,
        risks: [],
        agentGuidance: [],
        error: stderr.trim() || `Repository baseline analyzer exited with code ${exitCode}.`,
        changes: {
          appliedChanges: [],
          noOpReason: null,
        },
        rawOutput: normalizeAnalyzerRawOutput(stderr || stdout),
      });
    }

    const parsed = parseAnalyzerOutput(stdout);
    if (!parsed) {
      return finish({
        status: "invalid_output",
        summary: null,
        risks: [],
        agentGuidance: [],
        error: "Repository baseline analyzer did not return a valid JSON object.",
        changes: {
          appliedChanges: [],
          noOpReason: null,
        },
        rawOutput: normalizeAnalyzerRawOutput(stdout || stderr),
      });
    }
    const merged = mergeAnalyzerOutput(baseline, parsed);
    return finish({
      status: "succeeded",
      summary: parsed.architectureSummary,
      risks: parsed.risks,
      agentGuidance: parsed.agentGuidance,
      error: null,
      changes: {
        appliedChanges: merged.appliedChanges,
        noOpReason: merged.noOpReason,
      },
      rawOutput: normalizeAnalyzerRawOutput(stdout),
    }, merged.baseline);
  } catch (err) {
    const nodeError = err as NodeJS.ErrnoException;
    const notConfigured = nodeError.code === "ENOENT";
    return finish({
      status: notConfigured ? "not_configured" : "failed",
      summary: null,
      risks: [],
      agentGuidance: [],
      error: notConfigured
        ? `Repository baseline analyzer command not found: ${config.command}`
        : err instanceof Error ? err.message : "Repository baseline analyzer failed.",
      changes: {
        appliedChanges: [],
        noOpReason: null,
      },
      rawOutput: normalizeAnalyzerRawOutput(stderr || stdout),
    });
  }
}

export async function buildRepositoryDocumentationBaseline(
  workspace: RepositoryBaselineWorkspaceInput,
  options?: { runAnalyzer?: boolean },
): Promise<RepositoryDocumentationBaseline> {
  const updatedAt = new Date().toISOString();
  const gaps: string[] = [];
  const docs: RepositoryDocumentationBaselineDoc[] = [];
  const stack: string[] = [];
  let status: RepositoryDocumentationBaselineStatus = "ready";

  if (!workspace.cwd) {
    gaps.push("No local workspace path is configured, so only repository identity was recorded.");
  } else {
    try {
      const rootStat = await fs.lstat(workspace.cwd);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        status = "failed";
        gaps.push("Configured local workspace path is not a regular directory.");
      } else {
        const candidates = await collectDocCandidates(workspace.cwd);
        if (candidates.length === 0) {
          gaps.push("No allowlisted documentation or stack files were found in the local workspace.");
        }
        for (const relativePath of candidates) {
          const filePath = relativeSafePath(workspace.cwd, relativePath);
          if (!filePath) continue;
          const content = await fs.readFile(filePath, "utf8");
          docs.push({
            path: relativePath.replace(/\\/g, "/"),
            kind: detectDocKind(relativePath),
            summary: firstContentLine(content),
          });
          stack.push(...detectStack(relativePath, content));
        }
        stack.push(...await detectStackFromWorkspaceStructure(workspace.cwd));
      }
    } catch {
      status = "failed";
      gaps.push("Configured local workspace path could not be read.");
    }
  }

  if (!docs.some((doc) => doc.kind === "agent_instructions")) {
    gaps.push("No agent instruction file was detected in the allowlisted documentation set.");
  }

  const documentationFiles = docs.map((doc) => doc.path);
  const detectedStack = unique(stack);
  const recommendations = buildRecommendations({ docs, stack: detectedStack });
  const summary = status === "ready"
    ? [
        workspace.repoUrl ? `Repository: ${workspace.repoUrl}` : null,
        workspace.cwd ? `Local workspace: ${workspace.cwd}` : null,
        detectedStack.length > 0 ? `Detected stack: ${detectedStack.join(", ")}` : null,
        documentationFiles.length > 0 ? `Documentation files: ${documentationFiles.length}` : null,
      ].filter(Boolean).join(" | ")
    : "Repository documentation baseline could not read the configured local workspace.";

  let baseline: RepositoryDocumentationBaseline = {
    status,
    source: "scan",
    updatedAt,
    summary,
    stack: detectedStack,
    documentationFiles,
    guardrails: REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
    repository: {
      cwd: workspace.cwd,
      repoUrl: workspace.repoUrl,
      repoRef: workspace.repoRef,
      defaultRef: workspace.defaultRef,
    },
    docs,
    gaps,
    constraints: {
      repositoryWritesAllowed: false,
      backlogGenerationAllowed: false,
      childIssuesAllowed: false,
      agentWakeupAllowed: false,
    },
    recommendations,
    analysis: null,
  };

  if (options?.runAnalyzer && status === "ready") {
    baseline = await runRepositoryBaselineAnalyzer(baseline);
  }

  return baseline;
}
