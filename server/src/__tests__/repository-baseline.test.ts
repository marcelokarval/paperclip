import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeRepositoryDocumentationBaselineToMetadata } from "@paperclipai/shared";
import { buildRepositoryDocumentationBaseline } from "../services/repository-baseline.js";

async function makeTempRepo() {
  return mkdtemp(path.join(os.tmpdir(), "paperclip-repository-baseline-"));
}

describe("buildRepositoryDocumentationBaseline", () => {
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
