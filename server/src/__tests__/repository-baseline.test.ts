import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeRepositoryDocumentationBaselineToMetadata } from "@paperclipai/shared";
import { buildRepositoryDocumentationBaseline } from "../services/repository-baseline.js";

async function makeTempRepo() {
  return mkdtemp(path.join(os.tmpdir(), "paperclip-repository-baseline-"));
}

describe("buildRepositoryDocumentationBaseline", () => {
  const originalAnalyzerCommand = process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
  const originalAnalyzerArgs = process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
  const originalCodexCommand = process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND;
  const originalCodexArgs = process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_ARGS;
  const originalAnalyzerTimeout = process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS;

  afterEach(() => {
    if (originalAnalyzerCommand === undefined) delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    else process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = originalAnalyzerCommand;
    if (originalAnalyzerArgs === undefined) delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    else process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS = originalAnalyzerArgs;
    if (originalCodexCommand === undefined) delete process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND;
    else process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = originalCodexCommand;
    if (originalCodexArgs === undefined) delete process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_ARGS;
    else process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_ARGS = originalCodexArgs;
    if (originalAnalyzerTimeout === undefined) delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS;
    else process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS = originalAnalyzerTimeout;
  });

  it("scans only allowlisted repository documentation and stack files", async () => {
    const repoRoot = await makeTempRepo();
    await mkdir(path.join(repoRoot, "doc"), { recursive: true });
    await mkdir(path.join(repoRoot, "node_modules", "ignored"), { recursive: true });
    await writeFile(path.join(repoRoot, "README.md"), "# Paperclip\n\nControl plane.", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent rules\n\nNo unsafe work.", "utf8");
    await writeFile(path.join(repoRoot, "doc", "PRODUCT.md"), "# Product\n\nProduct context.", "utf8");
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({
        scripts: {
          test: "vitest",
          typecheck: "tsc --noEmit",
          build: "vite build",
        },
        dependencies: {
          express: "^5.0.0",
          react: "^19.0.0",
          "drizzle-orm": "^0.1.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^3.0.0",
        },
      }),
      "utf8",
    );
    await writeFile(path.join(repoRoot, "node_modules", "ignored", "README.md"), "# Ignored", "utf8");

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: "https://github.com/example/repo",
      repoRef: "main",
      defaultRef: "main",
    });

    expect(baseline.status).toBe("ready");
    expect(baseline.constraints).toEqual({
      repositoryWritesAllowed: false,
      backlogGenerationAllowed: false,
      childIssuesAllowed: false,
      agentWakeupAllowed: false,
    });
    expect(baseline.documentationFiles).toEqual(expect.arrayContaining([
      "README.md",
      "AGENTS.md",
      "doc/PRODUCT.md",
      "package.json",
    ]));
    expect(baseline.documentationFiles).not.toContain("node_modules/ignored/README.md");
    expect(baseline.stack).toEqual(expect.arrayContaining([
      "TypeScript",
      "React",
      "Express",
      "Drizzle",
      "Vitest",
      "npm script: test",
      "npm script: typecheck",
      "npm script: build",
    ]));
    expect(baseline.recommendations?.labels.map((label) => label.name)).toEqual(expect.arrayContaining([
      "frontend",
      "backend",
      "database",
      "docs",
      "qa",
    ]));
    expect(baseline.recommendations?.projectDefaults.suggestedVerificationCommands).toEqual(expect.arrayContaining([
      "pnpm -r typecheck",
      "pnpm test:run",
      "pnpm build",
    ]));
    expect(baseline.recommendations?.issuePolicy.parentChildGuidance.join("\n")).toContain("Do not create child issues");
  });

  it("records repo identity without local scanning when cwd is absent", async () => {
    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: null,
      defaultRef: "main",
    });

    expect(baseline.status).toBe("ready");
    expect(baseline.documentationFiles).toEqual([]);
    expect(baseline.gaps).toContain("No local workspace path is configured, so only repository identity was recorded.");
  });

  it("detects Next.js fullstack backend, jobs, storage, integrations, and validation signals", async () => {
    const repoRoot = await makeTempRepo();
    await mkdir(path.join(repoRoot, "src", "app", "api", "health"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "server", "jobs"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "server", "storage"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "server", "integrations"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "server", "auth"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "server", "security"), { recursive: true });
    await mkdir(path.join(repoRoot, "src", "server", "validation"), { recursive: true });
    await mkdir(path.join(repoRoot, "docs", "architecture"), { recursive: true });
    await writeFile(path.join(repoRoot, "README.md"), "# Fullstack repo\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent rules\n", "utf8");
    await writeFile(path.join(repoRoot, "docs", "architecture", "backend.md"), "# Backend foundation\n", "utf8");
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({
        scripts: {
          dev: "next dev",
          build: "next build",
          test: "vitest run",
          "jobs:foundation": "tsx scripts/jobs-worker.ts",
          "proof:foundation": "tsx scripts/foundation-proof.ts",
          "db:generate": "drizzle-kit generate",
        },
        dependencies: {
          "@aws-sdk/client-s3": "^3.0.0",
          bullmq: "^5.0.0",
          "drizzle-orm": "^0.1.0",
          ioredis: "^5.0.0",
          next: "^16.0.0",
          postgres: "^3.0.0",
          react: "^19.0.0",
          zod: "^4.0.0",
        },
        devDependencies: {
          tailwindcss: "^4.0.0",
          typescript: "^5.0.0",
          vitest: "^4.0.0",
        },
      }),
      "utf8",
    );

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    });

    expect(baseline.stack).toEqual(expect.arrayContaining([
      "Next.js",
      "Next.js App Router",
      "Next.js API routes",
      "Server modules",
      "Background jobs",
      "Storage layer",
      "External integrations",
      "Authentication/session",
      "Security layer",
      "Validation layer",
      "BullMQ",
      "Redis",
      "S3-compatible storage",
      "Zod",
      "Tailwind CSS",
      "npm script: jobs:foundation",
      "npm script: proof:foundation",
      "npm script: db:generate",
    ]));
    expect(baseline.recommendations?.labels.map((label) => label.name)).toEqual(expect.arrayContaining([
      "frontend",
      "nextjs",
      "backend",
      "database",
      "jobs",
      "storage",
      "integrations",
      "auth",
      "validation",
      "security",
      "qa",
      "docs",
    ]));
    expect(baseline.recommendations?.projectDefaults.ownershipAreas.map((area) => area.name)).toEqual(expect.arrayContaining([
      "Frontend",
      "Backend",
      "Jobs",
      "Storage",
      "Integrations",
      "Authentication",
      "Validation",
      "Documentation",
    ]));
  });

  it("can enrich the deterministic baseline with a read-only analyzer command", async () => {
    const repoRoot = await makeTempRepo();
    const analyzerPath = path.join(repoRoot, "fake-analyzer.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Analyzer repo\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent rules\n", "utf8");
    await writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest" },
        dependencies: { react: "^19.0.0" },
        devDependencies: { typescript: "^5.0.0" },
      }),
      "utf8",
    );
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"architectureSummary\":\"React app with operator docs.\",\"stackCorrections\":[\"Design system\"],\"suggestedLabels\":[{\"name\":\"design-system\",\"color\":\"#0ea5e9\",\"description\":\"Design-system tokens, UI primitives, and visual consistency.\",\"evidence\":[\"Analyzer\"],\"confidence\":\"medium\"}],\"canonicalDocs\":[\"AGENTS.md\"],\"ownershipAreas\":[{\"name\":\"Design System\",\"paths\":[\"src/components\"],\"recommendedLabels\":[\"design-system\"]}],\"verificationCommands\":[\"pnpm lint\"],\"agentGuidance\":[\"Read AGENTS.md before UI changes.\"],\"risks\":[\"No architecture decision record detected.\"]}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "custom_command",
      summary: "React app with operator docs.",
      agentGuidance: ["Read AGENTS.md before UI changes."],
      risks: ["No architecture decision record detected."],
      changes: {
        noOpReason: null,
      },
    });
    expect(baseline.analysis?.changes.appliedChanges).toEqual(expect.arrayContaining([
      "Updated repository summary with AI architecture analysis.",
      "Added stack signals: Design system",
      "Added suggested labels: design-system",
      "Added verification commands: pnpm lint",
      "Added analyzer risks to gaps: Analyzer risk: No architecture decision record detected.",
    ]));
    expect(baseline.stack).toContain("Design system");
    expect(baseline.gaps).toContain("Analyzer risk: No architecture decision record detected.");
    expect(baseline.recommendations?.labels.map((label) => label.name)).toEqual(expect.arrayContaining([
      "frontend",
      "design-system",
    ]));
    expect(baseline.recommendations?.projectDefaults.canonicalDocs).toContain("AGENTS.md");
    expect(baseline.recommendations?.projectDefaults.suggestedVerificationCommands).toContain("pnpm lint");
    expect(baseline.recommendations?.issuePolicy.reviewGuidance).toContain("Analyzer guidance: Read AGENTS.md before UI changes.");
  });

  it("records not_configured when analyzer execution is requested but the command is unavailable", async () => {
    const repoRoot = await makeTempRepo();
    await writeFile(path.join(repoRoot, "README.md"), "# Analyzer unavailable\n", "utf8");
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = "paperclip-missing-baseline-analyzer";
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.status).toBe("ready");
    expect(baseline.analysis).toMatchObject({
      status: "not_configured",
      provider: "custom_command",
    });
    expect(baseline.analysis?.error).toContain("paperclip-missing-baseline-analyzer");
  });

  it("passes --skip-git-repo-check to the default codex analyzer fallback", async () => {
    const repoRoot = await makeTempRepo();
    const fakeCodexPath = path.join(repoRoot, "fake-codex.sh");
    const argsCapturePath = path.join(repoRoot, "codex-args.txt");
    await writeFile(path.join(repoRoot, "README.md"), "# Codex fallback\n", "utf8");
    await writeFile(
      fakeCodexPath,
      [
        "#!/bin/sh",
        `printf '%s\\n' \"$@\" > ${JSON.stringify(argsCapturePath)}`,
        "cat >/dev/null",
        "printf '%s\\n' '{\"architectureSummary\":\"Fallback codex summary.\",\"stackCorrections\":[],\"suggestedLabels\":[],\"canonicalDocs\":[],\"ownershipAreas\":[],\"verificationCommands\":[],\"agentGuidance\":[],\"risks\":[]}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = fakeCodexPath;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "codex_local",
      summary: "Fallback codex summary.",
    });
    const capturedArgs = (await readFile(argsCapturePath, "utf8")).split(/\r?\n/).filter(Boolean);
    expect(capturedArgs).toContain("--skip-git-repo-check");
    expect(capturedArgs).toContain("--json");
  });

  it("accepts JSONL-style wrapped codex output and still enriches the baseline", async () => {
    const repoRoot = await makeTempRepo();
    const fakeCodexPath = path.join(repoRoot, "fake-codex-jsonl.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# JSONL fallback\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent rules\n", "utf8");
    await writeFile(
      fakeCodexPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"type\":\"item.completed\",\"item\":{\"text\":\"{\\\"architectureSummary\\\":\\\"JSONL summary.\\\",\\\"stackCorrections\\\":[\\\"Event bus\\\"],\\\"suggestedLabels\\\":[],\\\"canonicalDocs\\\":[],\\\"ownershipAreas\\\":[],\\\"verificationCommands\\\":[\\\"pnpm proof:jsonl\\\"],\\\"agentGuidance\\\":[\\\"Keep analyzer output compact.\\\"],\\\"risks\\\":[\\\"Route contracts inferred from docs only.\\\"]}\"}}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = fakeCodexPath;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "codex_local",
      summary: "JSONL summary.",
      risks: ["Route contracts inferred from docs only."],
      agentGuidance: ["Keep analyzer output compact."],
      changes: {
        noOpReason: null,
      },
    });
    expect(baseline.stack).toContain("Event bus");
    expect(baseline.gaps).toContain("Analyzer risk: Route contracts inferred from docs only.");
    expect(baseline.recommendations?.projectDefaults.suggestedVerificationCommands).toContain("pnpm proof:jsonl");
  });

  it("accepts real codex event-stream output with nested item.completed agent text", async () => {
    const repoRoot = await makeTempRepo();
    const fakeCodexPath = path.join(repoRoot, "fake-codex-events.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Codex events\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent rules\n", "utf8");
    await writeFile(
      fakeCodexPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"type\":\"thread.started\",\"thread_id\":\"thread-1\"}'",
        "printf '%s\\n' '{\"type\":\"turn.started\"}'",
        "printf '%s\\n' '{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"agent_message\",\"text\":\"{\\\"architectureSummary\\\":\\\"Codex event summary.\\\",\\\"stackCorrections\\\":[\\\"Event-envelope parsing\\\"],\\\"suggestedLabels\\\":[],\\\"canonicalDocs\\\":[],\\\"ownershipAreas\\\":[],\\\"verificationCommands\\\":[\\\"pnpm proof:events\\\"],\\\"agentGuidance\\\":[\\\"Prefer the nested item.text payload.\\\"],\\\"risks\\\":[\\\"Event envelopes can hide the actual JSON body.\\\"]}\"}}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = fakeCodexPath;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "codex_local",
      summary: "Codex event summary.",
      risks: ["Event envelopes can hide the actual JSON body."],
      agentGuidance: ["Prefer the nested item.text payload."],
      changes: {
        noOpReason: null,
      },
    });
    expect(baseline.stack).toContain("Event-envelope parsing");
    expect(baseline.gaps).toContain("Analyzer risk: Event envelopes can hide the actual JSON body.");
    expect(baseline.recommendations?.projectDefaults.suggestedVerificationCommands).toContain("pnpm proof:events");
  });

  it("accepts codex event-stream output when analyzer json is nested inside item.content[]", async () => {
    const repoRoot = await makeTempRepo();
    const fakeCodexPath = path.join(repoRoot, "fake-codex-content-parts.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Codex content parts\n", "utf8");
    await writeFile(path.join(repoRoot, "AGENTS.md"), "# Agent rules\n", "utf8");
    await writeFile(
      fakeCodexPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"content\":[{\"type\":\"output_text\",\"text\":\"{\\\"architectureSummary\\\":\\\"Content parts summary.\\\",\\\"stackCorrections\\\":[\\\"Content array parsing\\\"],\\\"suggestedLabels\\\":[],\\\"canonicalDocs\\\":[],\\\"ownershipAreas\\\":[],\\\"verificationCommands\\\":[],\\\"agentGuidance\\\":[],\\\"risks\\\":[]}\"}]}}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = fakeCodexPath;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "codex_local",
      summary: "Content parts summary.",
    });
    expect(baseline.stack).toContain("Content array parsing");
  });

  it("rejects unrelated event objects instead of treating them as analyzer success", async () => {
    const repoRoot = await makeTempRepo();
    const fakeCodexPath = path.join(repoRoot, "fake-codex-unrelated-event.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Unrelated event\n", "utf8");
    await writeFile(
      fakeCodexPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1}}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(fakeCodexPath, 0o755);
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_CODEX_COMMAND = fakeCodexPath;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "invalid_output",
      provider: "codex_local",
      error: "Repository baseline analyzer did not return a valid JSON object.",
    });
  });

  it("records a no-op explanation when analyzer succeeds without changing the baseline", async () => {
    const repoRoot = await makeTempRepo();
    const analyzerPath = path.join(repoRoot, "fake-analyzer-noop.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Analyzer no-op\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' '{\"architectureSummary\":null,\"stackCorrections\":[],\"suggestedLabels\":[],\"canonicalDocs\":[],\"ownershipAreas\":[],\"verificationCommands\":[],\"agentGuidance\":[],\"risks\":[]}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "succeeded",
      provider: "custom_command",
      summary: null,
      changes: {
        appliedChanges: [],
        noOpReason: "Analyzer completed but did not produce any material baseline changes.",
      },
      rawOutput: "{\"architectureSummary\":null,\"stackCorrections\":[],\"suggestedLabels\":[],\"canonicalDocs\":[],\"ownershipAreas\":[],\"verificationCommands\":[],\"agentGuidance\":[],\"risks\":[]}",
    });
  });

  it("captures normalized raw output for invalid analyzer responses", async () => {
    const repoRoot = await makeTempRepo();
    const analyzerPath = path.join(repoRoot, "fake-analyzer-invalid-output.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Analyzer invalid output\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '\\0bad\\r\\noutput\\n'",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "invalid_output",
      provider: "custom_command",
      error: "Repository baseline analyzer did not return a valid JSON object.",
      rawOutput: "bad\noutput",
    });
  });

  it("records failed when the analyzer exits non-zero and keeps stderr", async () => {
    const repoRoot = await makeTempRepo();
    const analyzerPath = path.join(repoRoot, "fake-analyzer-fail.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Analyzer failed\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "printf '%s\\n' 'baseline analyzer stderr' >&2",
        "exit 7",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "failed",
      provider: "custom_command",
      summary: null,
      error: "baseline analyzer stderr",
    });
  });

  it("records timed_out when the analyzer exceeds the configured timeout", async () => {
    const repoRoot = await makeTempRepo();
    const analyzerPath = path.join(repoRoot, "fake-analyzer-timeout.sh");
    await writeFile(path.join(repoRoot, "README.md"), "# Analyzer timeout\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        "cat >/dev/null",
        "sleep 1",
        "printf '%s\\n' '{\"architectureSummary\":\"too late\",\"stackCorrections\":[],\"suggestedLabels\":[],\"canonicalDocs\":[],\"ownershipAreas\":[],\"verificationCommands\":[],\"agentGuidance\":[],\"risks\":[]}'",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_TIMEOUT_MS = "50";
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    }, { runAnalyzer: true });

    expect(baseline.analysis).toMatchObject({
      status: "timed_out",
      provider: "custom_command",
      summary: null,
      error: "Repository baseline analyzer timed out.",
    });
  });

  it("keeps analysis unset when analyzer execution was not requested", async () => {
    const repoRoot = await makeTempRepo();
    const analyzerPath = path.join(repoRoot, "should-not-run.sh");
    const markerPath = path.join(repoRoot, "should-not-run.txt");
    await writeFile(path.join(repoRoot, "README.md"), "# No analyzer run\n", "utf8");
    await writeFile(
      analyzerPath,
      [
        "#!/bin/sh",
        `printf '%s' ran > ${JSON.stringify(markerPath)}`,
        "exit 0",
      ].join("\n"),
      "utf8",
    );
    await chmod(analyzerPath, 0o755);
    process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_COMMAND = analyzerPath;
    delete process.env.PAPERCLIP_REPOSITORY_BASELINE_ANALYZER_ARGS;

    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: repoRoot,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
    });

    expect(baseline.analysis).toBeNull();
    await expect(readFile(markerPath, "utf8")).rejects.toThrow();
  });

  it("preserves existing metadata when writing the baseline", async () => {
    const baseline = await buildRepositoryDocumentationBaseline({
      cwd: null,
      repoUrl: "https://github.com/example/repo",
      repoRef: null,
      defaultRef: null,
    });

    const metadata = writeRepositoryDocumentationBaselineToMetadata({
      metadata: { workspaceRuntime: { commands: [{ id: "web" }] } },
      baseline,
    });

    expect(metadata.workspaceRuntime).toEqual({ commands: [{ id: "web" }] });
    expect(metadata.repositoryDocumentationBaseline).toMatchObject({
      source: "scan",
      constraints: {
        repositoryWritesAllowed: false,
        backlogGenerationAllowed: false,
        childIssuesAllowed: false,
        agentWakeupAllowed: false,
      },
    });
  });
});
