import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegistry = vi.hoisted(() => ({
  getById: vi.fn(),
  getByKey: vi.fn(),
  listInstalled: vi.fn(),
  listByStatus: vi.fn(),
}));

const mockLifecycle = vi.hoisted(() => ({
  load: vi.fn(),
  unload: vi.fn(),
  upgrade: vi.fn(),
}));

const mockLoaderInstall = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockPublishGlobalLiveEvent = vi.hoisted(() => vi.fn());

vi.mock("../services/plugin-registry.js", () => ({
  pluginRegistryService: () => mockRegistry,
}));

vi.mock("../services/plugin-lifecycle.js", () => ({
  pluginLifecycleManager: () => mockLifecycle,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

vi.mock("../services/live-events.js", () => ({
  publishGlobalLiveEvent: mockPublishGlobalLiveEvent,
}));

type PluginRoutesFactory = typeof import("../routes/plugins.js").pluginRoutes;
type ErrorHandler = typeof import("../middleware/index.js").errorHandler;

let pluginRoutes: PluginRoutesFactory;
let errorHandler: ErrorHandler;

async function createApp(actorOverrides: Partial<Record<string, unknown>> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "board-user",
      companyIds: [],
      source: "local_implicit",
      isInstanceAdmin: false,
      ...actorOverrides,
    };
    next();
  });
  app.use(
    "/api",
    pluginRoutes({} as any, {
      installPlugin: mockLoaderInstall,
    } as any),
  );
  app.use(errorHandler);
  return app;
}

describe("plugin routes", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock("../routes/plugins.js");
    vi.doUnmock("../middleware/index.js");
    const [routes, middleware] = await Promise.all([
      vi.importActual<typeof import("../routes/plugins.js")>("../routes/plugins.js"),
      vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    ]);
    pluginRoutes = routes.pluginRoutes;
    errorHandler = middleware.errorHandler;
    vi.clearAllMocks();
    mockRegistry.getById.mockResolvedValue(null);
    mockRegistry.getByKey.mockResolvedValue(null);
    mockRegistry.listInstalled.mockResolvedValue([]);
    mockRegistry.listByStatus.mockResolvedValue([]);
  });

  it("requires instance admin to install plugins", async () => {
    const nonAdminApp = await createApp({
      source: "session",
      isInstanceAdmin: false,
    });
    const forbidden = await request(nonAdminApp)
      .post("/api/plugins/install")
      .send({ packageName: "@paperclipai/plugin-example" });
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403);

    const adminApp = await createApp({
      source: "session",
      isInstanceAdmin: true,
    });
    const badRequest = await request(adminApp)
      .post("/api/plugins/install")
      .send({});
    expect(badRequest.status, JSON.stringify(badRequest.body)).toBe(400);
  });

  it("requires instance admin to uninstall plugins", async () => {
    const nonAdminApp = await createApp({
      source: "session",
      isInstanceAdmin: false,
    });
    const forbidden = await request(nonAdminApp).delete("/api/plugins/plugin-1");
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403);

    const adminApp = await createApp({
      source: "session",
      isInstanceAdmin: true,
    });
    const missing = await request(adminApp).delete("/api/plugins/plugin-1");
    expect(missing.status, JSON.stringify(missing.body)).toBe(404);
  });

  it("requires instance admin to upgrade plugins", async () => {
    const nonAdminApp = await createApp({
      source: "session",
      isInstanceAdmin: false,
    });
    const forbidden = await request(nonAdminApp)
      .post("/api/plugins/plugin-1/upgrade")
      .send({ version: "1.2.3" });
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403);

    const adminApp = await createApp({
      source: "session",
      isInstanceAdmin: true,
    });
    const missing = await request(adminApp)
      .post("/api/plugins/plugin-1/upgrade")
      .send({ version: "1.2.3" });
    expect(missing.status, JSON.stringify(missing.body)).toBe(404);
  });
});
