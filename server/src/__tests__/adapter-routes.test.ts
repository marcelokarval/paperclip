import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { ServerAdapterModule } from "../adapters/index.js";

const overridingConfigSchemaAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: async () => ({ exitCode: 0, signal: null, timedOut: false }),
  testEnvironment: async () => ({
    adapterType: "claude_local",
    status: "pass",
    checks: [],
    testedAt: new Date(0).toISOString(),
  }),
  getConfigSchema: async () => ({
    version: 1,
    fields: [
      {
        key: "mode",
        type: "text",
        label: "Mode",
      },
    ],
  }),
};

let registerServerAdapter: typeof import("../adapters/index.js").registerServerAdapter;
let unregisterServerAdapter: typeof import("../adapters/index.js").unregisterServerAdapter;
let setOverridePaused: typeof import("../adapters/registry.js").setOverridePaused;
let adapterRoutes: typeof import("../routes/adapters.js").adapterRoutes;
let errorHandler: typeof import("../middleware/index.js").errorHandler;

function createApp(options?: { isInstanceAdmin?: boolean; source?: string }) {
  const isInstanceAdmin = options?.isInstanceAdmin ?? false;
  const source = options?.source ?? "local_implicit";
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: [],
      source,
      isInstanceAdmin,
    };
    next();
  });
  app.use("/api", adapterRoutes());
  app.use(errorHandler);
  return app;
}

describe("adapter routes", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock("../adapters/index.js");
    vi.doUnmock("../adapters/registry.js");
    vi.doUnmock("../routes/adapters.js");
    vi.doUnmock("../middleware/index.js");
    const [adapters, registry, routes, middleware] = await Promise.all([
      vi.importActual<typeof import("../adapters/index.js")>("../adapters/index.js"),
      vi.importActual<typeof import("../adapters/registry.js")>("../adapters/registry.js"),
      vi.importActual<typeof import("../routes/adapters.js")>("../routes/adapters.js"),
      vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    ]);
    registerServerAdapter = adapters.registerServerAdapter;
    unregisterServerAdapter = adapters.unregisterServerAdapter;
    setOverridePaused = registry.setOverridePaused;
    adapterRoutes = routes.adapterRoutes;
    errorHandler = middleware.errorHandler;
    setOverridePaused("claude_local", false);
    unregisterServerAdapter("claude_local");
    registerServerAdapter(overridingConfigSchemaAdapter);
  });

  afterEach(() => {
    setOverridePaused("claude_local", false);
    unregisterServerAdapter("claude_local");
  });

  it("uses the active adapter when resolving config schema for a paused builtin override", async () => {
    const app = createApp();

    const active = await request(app).get("/api/adapters/claude_local/config-schema");
    expect(active.status, JSON.stringify(active.body)).toBe(200);
    expect(active.body).toMatchObject({
      fields: [{ key: "mode" }],
    });

    const paused = await request(app)
      .patch("/api/adapters/claude_local/override")
      .send({ paused: true });
    expect(paused.status, JSON.stringify(paused.body)).toBe(200);

    const builtin = await request(app).get("/api/adapters/claude_local/config-schema");
    expect([200, 404], JSON.stringify(builtin.body)).toContain(builtin.status);
    expect(builtin.body).not.toMatchObject({
      fields: [{ key: "mode" }],
    });
  });

  it("requires instance admin to install an adapter", async () => {
    const nonAdminApp = createApp({ isInstanceAdmin: false, source: "session" });
    const forbidden = await request(nonAdminApp)
      .post("/api/adapters/install")
      .send({ packageName: "example-paperclip-adapter" });
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403);

    const adminApp = createApp({ isInstanceAdmin: true });
    const badRequest = await request(adminApp)
      .post("/api/adapters/install")
      .send({});
    expect(badRequest.status, JSON.stringify(badRequest.body)).toBe(400);
  });

  it("requires instance admin to remove an external adapter", async () => {
    const nonAdminApp = createApp({ isInstanceAdmin: false, source: "session" });
    const forbidden = await request(nonAdminApp).delete("/api/adapters/claude_local");
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403);

    const adminApp = createApp({ isInstanceAdmin: true });
    const builtinRemoval = await request(adminApp).delete("/api/adapters/claude_local");
    expect(builtinRemoval.status, JSON.stringify(builtinRemoval.body)).toBe(403);
  });
});
