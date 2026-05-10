import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import { patchOperatorProfileSchema } from "@paperclipai/shared";
import { assetService, instanceSettingsService, logActivity } from "../services/index.js";
import type { StorageService } from "../storage/types.js";
import { conflict, forbidden } from "../errors.js";
import {
  MAX_OPERATOR_AVATAR_UPLOAD_BYTES,
  sanitizeOperatorAvatarImage,
} from "../image-sanitize.js";
import { validate } from "../middleware/validate.js";
import { operatorProfileService, type OperatorProfileActor } from "../services/operator-profile.js";
import { getActorInfo } from "./authz.js";

const PROFILE_ASSET_IMAGE_RE = /^\/api\/assets\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/content$/;

function getOperatorProfileActor(req: Request): OperatorProfileActor {
  if (req.actor.type !== "board" || !req.actor.userId) {
    throw forbidden("Board access required");
  }
  if (
    req.actor.source !== "local_implicit" &&
    req.actor.source !== "session" &&
    req.actor.source !== "board_key"
  ) {
    throw forbidden("Board access required");
  }
  return {
    userId: req.actor.userId,
    source: req.actor.source,
    isInstanceAdmin: req.actor.source === "local_implicit" || req.actor.isInstanceAdmin === true,
  };
}

async function runSingleFileUpload(
  upload: ReturnType<typeof multer>,
  req: Request,
  res: Response,
) {
  await new Promise<void>((resolve, reject) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function listActorCompanyIds(req: Request, settingsSvc: ReturnType<typeof instanceSettingsService>) {
  if (req.actor.type !== "board") return [];
  if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin === true) {
    return settingsSvc.listCompanyIds();
  }
  return req.actor.companyIds ?? [];
}

export function operatorProfileRoutes(db: Db, storage?: StorageService) {
  const profileSvc = operatorProfileService(db);
  const settingsSvc = instanceSettingsService(db);
  const assets = assetService(db);
  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_OPERATOR_AVATAR_UPLOAD_BYTES, files: 1 },
  });
  const router = Router();

  async function clearMissingProfileAssetImage(
    actor: OperatorProfileActor,
    profile: Awaited<ReturnType<typeof profileSvc.getForActor>>,
  ) {
    const assetId = profile.image?.match(PROFILE_ASSET_IMAGE_RE)?.[1];
    if (!assetId) return profile;

    const asset = await assets.getById(assetId);
    if (!asset) {
      return profileSvc.updateForActor(actor, { image: null });
    }

    if (!storage) return profile;

    const object = await storage.headObject(asset.companyId, asset.objectKey);
    if (object.exists) return profile;

    return profileSvc.updateForActor(actor, { image: null });
  }

  router.get("/operator/profile", async (req, res) => {
    const actor = getOperatorProfileActor(req);
    const profile = await profileSvc.getForActor(actor);
    res.json(await clearMissingProfileAssetImage(actor, profile));
  });

  router.patch(
    "/operator/profile",
    validate(patchOperatorProfileSchema),
    async (req, res) => {
      const actor = getOperatorProfileActor(req);
      const updated = await profileSvc.updateForActor(actor, req.body);
      const actorInfo = getActorInfo(req);
      const companyIds = await settingsSvc.listCompanyIds();

      await Promise.all(
        companyIds.map((companyId) =>
          logActivity(db, {
            companyId,
            actorType: actorInfo.actorType,
            actorId: actorInfo.actorId,
            agentId: actorInfo.agentId,
            runId: actorInfo.runId,
            action: "operator.profile_updated",
            entityType: "operator_profile",
            entityId: updated.id,
            details: {
              changedKeys: Object.keys(req.body).sort(),
            },
          }),
        ),
      );

      res.json(updated);
    },
  );

  router.post("/operator/profile/avatar", async (req, res) => {
    if (!storage) {
      throw conflict("Storage service is not configured");
    }

    const actor = getOperatorProfileActor(req);
    try {
      await runSingleFileUpload(avatarUpload, req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `Image exceeds ${MAX_OPERATOR_AVATAR_UPLOAD_BYTES} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }

    const sanitized = await sanitizeOperatorAvatarImage({
      body: file.buffer,
      contentType: file.mimetype || "",
    });
    const companyIds = await listActorCompanyIds(req, settingsSvc);
    const assetCompanyId = companyIds[0];
    if (!assetCompanyId) {
      throw conflict("Create or join a company before uploading an operator avatar");
    }

    const actorInfo = getActorInfo(req);
    const stored = await storage.putFile({
      companyId: assetCompanyId,
      namespace: "assets/operators",
      originalFilename: file.originalname || "operator-avatar.png",
      contentType: sanitized.contentType,
      body: sanitized.body,
    });
    const asset = await assets.create(assetCompanyId, {
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actorInfo.agentId,
      createdByUserId: actorInfo.actorType === "user" ? actorInfo.actorId : null,
    });
    const contentPath = `/api/assets/${asset.id}/content`;
    const updated = await profileSvc.updateForActor(actor, { image: contentPath });

    await Promise.all(
      companyIds.map((companyId) =>
        logActivity(db, {
          companyId,
          actorType: actorInfo.actorType,
          actorId: actorInfo.actorId,
          agentId: actorInfo.agentId,
          runId: actorInfo.runId,
          action: "operator.avatar_uploaded",
          entityType: "operator_profile",
          entityId: updated.id,
          details: {
            assetId: asset.id,
            contentType: asset.contentType,
            byteSize: asset.byteSize,
          },
        }),
      ),
    );

    res.status(201).json(updated);
  });

  return router;
}
