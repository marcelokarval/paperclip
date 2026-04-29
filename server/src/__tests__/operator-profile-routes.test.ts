import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { StorageService } from "../storage/types.js";

const mockOperatorProfileService = vi.hoisted(() => ({
  getForActor: vi.fn(),
  updateForActor: vi.fn(),
}));
const mockInstanceSettingsService = vi.hoisted(() => ({
  listCompanyIds: vi.fn(),
}));
const mockAssetService = vi.hoisted(() => ({
  create: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/operator-profile.js", () => ({
  operatorProfileService: () => mockOperatorProfileService,
}));
vi.mock("../services/index.js", () => ({
  instanceSettingsService: () => mockInstanceSettingsService,
  assetService: () => mockAssetService,
  logActivity: mockLogActivity,
}));

function createStorageService(): StorageService & { putFile: ReturnType<typeof vi.fn> } {
  return {
    provider: "local_disk",
    putFile: vi.fn(async (input) => ({
      provider: "local_disk",
      objectKey: `${input.namespace}/avatar.png`,
      contentType: input.contentType,
      byteSize: input.body.length,
      sha256: "sha256-avatar",
      originalFilename: input.originalFilename,
    })),
    getObject: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

async function createPngBuffer() {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: "#0f766e",
    },
  }).png().toBuffer();
}

async function createApp(actor: any, storage?: StorageService) {
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
  app.use("/api", operatorProfileRoutes({} as any, storage));
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
    mockAssetService.create.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      companyId: "company-1",
      provider: "local_disk",
      objectKey: "assets/operators/avatar.png",
      contentType: "image/png",
      byteSize: 100,
      sha256: "sha256-avatar",
      originalFilename: "avatar.png",
      createdByAgentId: null,
      createdByUserId: "local-board",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
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

  it("uploads a sanitized operator avatar and persists its asset path", async () => {
    const storage = createStorageService();
    mockOperatorProfileService.updateForActor.mockResolvedValue({
      id: "local-board",
      name: "Marcelo",
      email: "marcelo@example.com",
      image: "/api/assets/11111111-1111-4111-8111-111111111111/content",
      source: "local_implicit",
      isInstanceAdmin: true,
    });
    const app = await createApp({
      type: "board",
      userId: "local-board",
      source: "local_implicit",
      isInstanceAdmin: true,
    }, storage);

    const res = await request(app)
      .post("/api/operator/profile/avatar")
      .attach("file", await createPngBuffer(), { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.image).toBe("/api/assets/11111111-1111-4111-8111-111111111111/content");
    expect(storage.putFile).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      namespace: "assets/operators",
      contentType: "image/png",
      body: expect.any(Buffer),
    }));
    expect(mockAssetService.create).toHaveBeenCalledWith("company-1", expect.objectContaining({
      contentType: "image/png",
      objectKey: "assets/operators/avatar.png",
    }));
    expect(mockOperatorProfileService.updateForActor).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "local-board" }),
      { image: "/api/assets/11111111-1111-4111-8111-111111111111/content" },
    );
  });

  it("rejects operator avatars that cannot be decoded", async () => {
    const storage = createStorageService();
    const app = await createApp({
      type: "board",
      userId: "local-board",
      source: "local_implicit",
      isInstanceAdmin: true,
    }, storage);

    const res = await request(app)
      .post("/api/operator/profile/avatar")
      .attach("file", Buffer.from("not an image"), { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Image could not be decoded");
    expect(storage.putFile).not.toHaveBeenCalled();
    expect(mockAssetService.create).not.toHaveBeenCalled();
  });
});
