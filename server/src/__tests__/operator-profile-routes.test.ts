import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOperatorProfileService = vi.hoisted(() => ({
  getForActor: vi.fn(),
  updateForActor: vi.fn(),
}));
const mockInstanceSettingsService = vi.hoisted(() => ({
  listCompanyIds: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/operator-profile.js", () => ({
  operatorProfileService: () => mockOperatorProfileService,
}));
vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => mockInstanceSettingsService,
  logActivity: mockLogActivity,
}));

async function createApp(actor: any) {
  const [{ errorHandler }, { operatorProfileRoutes }] = await Promise.all([
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    vi.importActual<typeof import("../routes/operator-profile.js")>("../routes/operator-profile.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", operatorProfileRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("operator profile routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockOperatorProfileService.getForActor.mockResolvedValue({
      id: "local-board",
      name: "Marcelo",
      email: "marcelo@example.com",
      image: "https://example.com/avatar.png",
      source: "local_implicit",
      isInstanceAdmin: true,
    });
    mockOperatorProfileService.updateForActor.mockResolvedValue({
      id: "local-board",
      name: "Marcelo Karval",
      email: "marcelo@prop4you.com",
      image: null,
      source: "local_implicit",
      isInstanceAdmin: true,
    });
    mockInstanceSettingsService.listCompanyIds.mockResolvedValue(["company-1"]);
  });

  it("returns the current board operator profile", async () => {
    const app = await createApp({
      type: "board",
      userId: "local-board",
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app).get("/api/operator/profile");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: "local-board",
      name: "Marcelo",
      email: "marcelo@example.com",
      image: "https://example.com/avatar.png",
      source: "local_implicit",
      isInstanceAdmin: true,
    });
    expect(mockOperatorProfileService.getForActor).toHaveBeenCalledWith({
      userId: "local-board",
      source: "local_implicit",
      isInstanceAdmin: true,
    });
  });

  it("updates the current board operator profile", async () => {
    const app = await createApp({
      type: "board",
      userId: "local-board",
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app)
      .patch("/api/operator/profile")
      .send({
        name: "Marcelo Karval",
        email: "marcelo@prop4you.com",
        image: "",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: "local-board",
      name: "Marcelo Karval",
      email: "marcelo@prop4you.com",
      image: null,
      source: "local_implicit",
      isInstanceAdmin: true,
    });
    expect(mockOperatorProfileService.updateForActor).toHaveBeenCalledWith(
      {
        userId: "local-board",
        source: "local_implicit",
        isInstanceAdmin: true,
      },
      {
        name: "Marcelo Karval",
        email: "marcelo@prop4you.com",
        image: "",
      },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      {} as any,
      expect.objectContaining({
        companyId: "company-1",
        action: "operator.profile_updated",
        entityType: "operator_profile",
        entityId: "local-board",
      }),
    );
  });

  it("rejects agent callers", async () => {
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/operator/profile");

    expect(res.status).toBe(403);
    expect(mockOperatorProfileService.getForActor).not.toHaveBeenCalled();
  });
});
