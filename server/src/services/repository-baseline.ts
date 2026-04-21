import { promises as fs } from "node:fs";
import path from "node:path";

export type RepositoryDocumentationBaselineStatus = "ready" | "failed";

export type RepositoryDocumentationBaselineDoc = {
  path: string;
  kind: "readme" | "agent_instructions" | "product" | "architecture" | "development" | "config" | "other";
  summary: string | null;
};

export type RepositoryDocumentationBaseline = {
  status: RepositoryDocumentationBaselineStatus;
  source: "scan";
  updatedAt: string;
  summary: string | null;
  stack: string[];
  documentationFiles: string[];
  guardrails: string[];
  repository: {
    cwd: string | null;
    repoUrl: string | null;
    repoRef: string | null;
    defaultRef: string | null;
  };
  docs: RepositoryDocumentationBaselineDoc[];
  gaps: string[];
  constraints: {
    repositoryWritesAllowed: false;
    backlogGenerationAllowed: false;
    childIssuesAllowed: false;
    agentWakeupAllowed: false;
  };
};

export type RepositoryBaselineWorkspaceInput = {
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
};

export const REPOSITORY_DOCUMENTATION_BASELINE_GUARDRAILS = [
  "Documentation only; do not create issues or child issues from this baseline.",
  "Do not wake agents, assign work, create PRs, or write files to the repository.",
  "Treat findings as Paperclip-owned context until an operator explicitly converts them into work.",
];

const MAX_DOC_FILES = 32;
const MAX_DOC_BYTES = 128 * 1024;
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
    if (dependencyNames.has("vite")) stack.push("Vite");
    if (dependencyNames.has("express")) stack.push("Express");
    if (dependencyNames.has("drizzle-orm")) stack.push("Drizzle");
    if (dependencyNames.has("vitest")) stack.push("Vitest");
    if (dependencyNames.has("@playwright/test")) stack.push("Playwright");
    for (const scriptName of Object.keys(parsed.scripts ?? {})) {
      if (["test", "typecheck", "build", "dev"].includes(scriptName)) {
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

export async function buildRepositoryDocumentationBaseline(
  workspace: RepositoryBaselineWorkspaceInput,
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
  const summary = status === "ready"
    ? [
        workspace.repoUrl ? `Repository: ${workspace.repoUrl}` : null,
        workspace.cwd ? `Local workspace: ${workspace.cwd}` : null,
        detectedStack.length > 0 ? `Detected stack: ${detectedStack.join(", ")}` : null,
        documentationFiles.length > 0 ? `Documentation files: ${documentationFiles.length}` : null,
      ].filter(Boolean).join(" | ")
    : "Repository documentation baseline could not read the configured local workspace.";

  return {
    status,
    source: "scan",
    updatedAt,
    summary,
    stack: detectedStack,
    documentationFiles,
    guardrails: REPOSITORY_DOCUMENTATION_BASELINE_GUARDRAILS,
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
  };
}

export function writeRepositoryDocumentationBaselineToMetadata(input: {
  metadata: Record<string, unknown> | null | undefined;
  baseline: RepositoryDocumentationBaseline;
}): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    repositoryDocumentationBaseline: input.baseline,
  };
}
