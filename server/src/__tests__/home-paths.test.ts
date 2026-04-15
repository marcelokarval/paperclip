import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

const ORIGINAL_PAPERCLIP_CONFIG = process.env.PAPERCLIP_CONFIG;
const ORIGINAL_PAPERCLIP_HOME = process.env.PAPERCLIP_HOME;
const ORIGINAL_PAPERCLIP_INSTANCE_ID = process.env.PAPERCLIP_INSTANCE_ID;

afterEach(() => {
  if (ORIGINAL_PAPERCLIP_CONFIG === undefined) delete process.env.PAPERCLIP_CONFIG;
  else process.env.PAPERCLIP_CONFIG = ORIGINAL_PAPERCLIP_CONFIG;

  if (ORIGINAL_PAPERCLIP_HOME === undefined) delete process.env.PAPERCLIP_HOME;
  else process.env.PAPERCLIP_HOME = ORIGINAL_PAPERCLIP_HOME;

  if (ORIGINAL_PAPERCLIP_INSTANCE_ID === undefined) delete process.env.PAPERCLIP_INSTANCE_ID;
  else process.env.PAPERCLIP_INSTANCE_ID = ORIGINAL_PAPERCLIP_INSTANCE_ID;
});

describe("resolvePaperclipInstanceRoot", () => {
  it("falls back to the explicit PAPERCLIP_CONFIG directory when home and instance env are unset", () => {
    delete process.env.PAPERCLIP_HOME;
    delete process.env.PAPERCLIP_INSTANCE_ID;
    process.env.PAPERCLIP_CONFIG = "/tmp/paperclip-test/config/config.json";

    expect(resolvePaperclipInstanceRoot()).toBe(path.resolve("/tmp/paperclip-test/config"));
  });

  it("keeps PAPERCLIP_HOME and PAPERCLIP_INSTANCE_ID as stronger signals than PAPERCLIP_CONFIG", () => {
    process.env.PAPERCLIP_HOME = "/tmp/paperclip-home";
    process.env.PAPERCLIP_INSTANCE_ID = "worktree-1";
    process.env.PAPERCLIP_CONFIG = "/tmp/paperclip-test/config/config.json";

    expect(resolvePaperclipInstanceRoot()).toBe(
      path.resolve("/tmp/paperclip-home/instances/worktree-1"),
    );
  });
});
