import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { patchOperatorProfileSchema } from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { instanceSettingsService, logActivity } from "../services/index.js";
import { operatorProfileService, type OperatorProfileActor } from "../services/operator-profile.js";
import { getActorInfo } from "./authz.js";

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

export function operatorProfileRoutes(db: Db) {
  const profileSvc = operatorProfileService(db);
  const settingsSvc = instanceSettingsService(db);
  const router = Router();

  router.get("/operator/profile", async (req, res) => {
    res.json(await profileSvc.getForActor(getOperatorProfileActor(req)));
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

  return router;
}
