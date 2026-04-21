import { describe, expect, it } from "vitest";
import {
  REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS,
  readRepositoryDocumentationBaseline,
  repositoryDocumentationBaselineFormFromMetadata,
  splitBaselineLines,
  writeRepositoryDocumentationBaselineMetadata,
} from "./repository-documentation-baseline";

describe("repository documentation baseline metadata", () => {
  it("uses safe defaults when workspace metadata has no baseline", () => {
    const form = repositoryDocumentationBaselineFormFromMetadata({ workspaceRuntime: { commands: [] } });

    expect(form.status).toBe("not_started");
    expect(form.summary).toBe("");
    expect(form.guardrails).toBe(REPOSITORY_DOCUMENTATION_BASELINE_DEFAULT_GUARDRAILS.join("\n"));
  });

  it("normalizes persisted baseline metadata into editable text fields", () => {
    const form = repositoryDocumentationBaselineFormFromMetadata({
      repositoryDocumentationBaseline: {
        status: "ready",
        source: "manual",
        updatedAt: "2026-04-20T12:00:00.000Z",
        summary: "React and Express monorepo.",
        stack: ["React", "Express"],
        documentationFiles: ["AGENTS.md", "doc/PRODUCT.md"],
        guardrails: ["No issue splitting."],
      },
    });

    expect(form).toMatchObject({
      status: "ready",
      summary: "React and Express monorepo.",
      stack: "React\nExpress",
      documentationFiles: "AGENTS.md\ndoc/PRODUCT.md",
      guardrails: "No issue splitting.",
    });
  });

  it("reads scan metadata with repository gaps from the shared contract", () => {
    const baseline = readRepositoryDocumentationBaseline({
      repositoryDocumentationBaseline: {
        status: "ready",
        source: "scan",
        updatedAt: "2026-04-20T12:00:00.000Z",
        summary: "Repo identity only.",
        stack: [],
        documentationFiles: [],
        guardrails: ["Documentation only"],
        gaps: ["No local workspace path is configured, so only repository identity was recorded."],
      },
    });

    expect(baseline).toMatchObject({
      status: "ready",
      source: "scan",
      summary: "Repo identity only.",
      gaps: ["No local workspace path is configured, so only repository identity was recorded."],
    });
  });

  it("preserves unrelated metadata while writing the baseline", () => {
    const metadata = writeRepositoryDocumentationBaselineMetadata({
      metadata: {
        workspaceRuntime: { commands: [{ id: "web" }] },
      },
      updatedAt: "2026-04-20T12:00:00.000Z",
      form: {
        status: "ready",
        summary: "Baseline exists.",
        stack: "TypeScript, React\nExpress",
        documentationFiles: "AGENTS.md\nREADME.md",
        guardrails: "Documentation only",
      },
    });

    expect(metadata.workspaceRuntime).toEqual({ commands: [{ id: "web" }] });
    expect(metadata.repositoryDocumentationBaseline).toEqual({
      status: "ready",
      source: "manual",
      updatedAt: "2026-04-20T12:00:00.000Z",
      summary: "Baseline exists.",
      stack: ["TypeScript", "React", "Express"],
      documentationFiles: ["AGENTS.md", "README.md"],
      guardrails: ["Documentation only"],
    });
  });

  it("splits comma-separated and newline-separated lists", () => {
    expect(splitBaselineLines("AGENTS.md, README.md\ndoc/PRODUCT.md")).toEqual([
      "AGENTS.md",
      "README.md",
      "doc/PRODUCT.md",
    ]);
  });
});
