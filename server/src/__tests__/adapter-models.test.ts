import { beforeEach, describe, expect, it, vi } from "vitest";
import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";
import { models as cursorFallbackModels } from "@paperclipai/adapter-cursor-local";
import { models as opencodeFallbackModels } from "@paperclipai/adapter-opencode-local";
import { resetOpenCodeModelsCacheForTests } from "@paperclipai/adapter-opencode-local/server";
import { listAdapterModels } from "../adapters/index.js";
import { resetCodexModelsCacheForTests, setCodexModelsRunnerForTests } from "../adapters/codex-models.js";
import { resetCursorModelsCacheForTests, setCursorModelsRunnerForTests } from "../adapters/cursor-models.js";

describe("adapter model listing", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.PAPERCLIP_OPENCODE_COMMAND;
    resetCodexModelsCacheForTests();
    setCodexModelsRunnerForTests(null);
    resetCursorModelsCacheForTests();
    setCursorModelsRunnerForTests(null);
    resetOpenCodeModelsCacheForTests();
    vi.restoreAllMocks();
  });

  it("returns an empty list for unknown adapters", async () => {
    const models = await listAdapterModels("unknown_adapter");
    expect(models).toEqual([]);
  });

  it("returns codex fallback models when no OpenAI key is available", async () => {
    setCodexModelsRunnerForTests(() => ({
      status: null,
      stdout: "",
      stderr: "",
      hasError: true,
    }));
    const models = await listAdapterModels("codex_local");

    expect(models).toEqual(codexFallbackModels);
  });

  it("loads codex models from the local Codex catalog and merges fallback options", async () => {
    const runner = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        models: [
          { slug: "gpt-5.5", display_name: "GPT-5.5" },
          { slug: "gpt-5", display_name: "GPT-5" },
        ],
      }),
      stderr: "",
      hasError: false,
    }));
    setCodexModelsRunnerForTests(runner);

    const first = await listAdapterModels("codex_local");
    const second = await listAdapterModels("codex_local");

    expect(runner).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.some((model) => model.id === "gpt-5.5")).toBe(true);
    expect(first.some((model) => model.id === "codex-mini-latest")).toBe(true);
  });

  it("refreshes codex models on demand instead of serving the cache", async () => {
    const runner = vi
      .fn()
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ models: [{ slug: "gpt-5.4", display_name: "GPT-5.4" }] }),
        stderr: "",
        hasError: false,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ models: [{ slug: "gpt-5.5", display_name: "GPT-5.5" }] }),
        stderr: "",
        hasError: false,
      });
    setCodexModelsRunnerForTests(runner);

    const first = await listAdapterModels("codex_local");
    const second = await listAdapterModels("codex_local", { refresh: true });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(first.some((model) => model.id === "gpt-5.4")).toBe(true);
    expect(second.some((model) => model.id === "gpt-5.5")).toBe(true);
  });

  it("falls back to static codex models when Codex model discovery fails", async () => {
    setCodexModelsRunnerForTests(() => ({
      status: 1,
      stdout: "",
      stderr: "not authenticated",
      hasError: false,
    }));

    const models = await listAdapterModels("codex_local");
    expect(models).toEqual(codexFallbackModels);
  });


  it("returns cursor fallback models when CLI discovery is unavailable", async () => {
    setCursorModelsRunnerForTests(() => ({
      status: null,
      stdout: "",
      stderr: "",
      hasError: true,
    }));

    const models = await listAdapterModels("cursor");
    expect(models).toEqual(cursorFallbackModels);
  });

  it("returns opencode fallback models including gpt-5.4", async () => {
    process.env.PAPERCLIP_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";

    const models = await listAdapterModels("opencode_local");

    expect(models).toEqual(opencodeFallbackModels);
  });

  it("loads cursor models dynamically and caches them", async () => {
    const runner = vi.fn(() => ({
      status: 0,
      stdout: "Available models: auto, composer-1.5, gpt-5.3-codex-high, sonnet-4.6",
      stderr: "",
      hasError: false,
    }));
    setCursorModelsRunnerForTests(runner);

    const first = await listAdapterModels("cursor");
    const second = await listAdapterModels("cursor");

    expect(runner).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.some((model) => model.id === "auto")).toBe(true);
    expect(first.some((model) => model.id === "gpt-5.3-codex-high")).toBe(true);
    expect(first.some((model) => model.id === "composer-1")).toBe(true);
  });

});
