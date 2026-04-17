import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultClientContext,
  readContext,
  resolveContextPath,
  setCurrentProfile,
  upsertProfile,
  writeContext,
} from "../client/context.js";
import { resolveDefaultContextPath } from "../config/home.js";

function createTempContextPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-cli-context-"));
  return path.join(dir, "context.json");
}

describe("client context store", () => {
  it("returns default context when file does not exist", () => {
    const contextPath = createTempContextPath();
    const context = readContext(contextPath);
    expect(context).toEqual(defaultClientContext());
  });

  it("upserts profile values and switches current profile", () => {
    const contextPath = createTempContextPath();

    upsertProfile(
      "work",
      {
        apiBase: "http://localhost:3100",
        companyId: "company-123",
        apiKeyEnvVarName: "PAPERCLIP_AGENT_TOKEN",
      },
      contextPath,
    );

    setCurrentProfile("work", contextPath);
    const context = readContext(contextPath);

    expect(context.currentProfile).toBe("work");
    expect(context.profiles.work).toEqual({
      apiBase: "http://localhost:3100",
      companyId: "company-123",
      apiKeyEnvVarName: "PAPERCLIP_AGENT_TOKEN",
    });
  });

  it("normalizes invalid file content to safe defaults", () => {
    const contextPath = createTempContextPath();
    writeContext(
      {
        version: 1,
        currentProfile: "x",
        profiles: {
          x: {
            apiBase: " ",
            companyId: " ",
            apiKeyEnvVarName: " ",
          },
        },
      },
      contextPath,
    );

    const context = readContext(contextPath);
    expect(context.currentProfile).toBe("x");
    expect(context.profiles.x).toEqual({});
  });

  it("does not auto-discover context from current working directory ancestry", () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-cli-workspace-"));
    const projectDir = path.join(workspaceDir, "nested", "project");
    fs.mkdirSync(path.join(workspaceDir, ".paperclip"), { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, ".paperclip", "context.json"),
      JSON.stringify(defaultClientContext()),
      "utf-8",
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);
      delete process.env.PAPERCLIP_CONTEXT;
      expect(resolveContextPath()).toBe(resolveDefaultContextPath());
    } finally {
      process.chdir(originalCwd);
    }
  });
});
