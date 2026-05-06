import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { companyService, logActivity } from "../services/index.js";
import { providerRateLimitService } from "../services/provider-rate-limits.js";

export function providerRateLimitRoutes(db: Db) {
  const router = Router();
  const companies = companyService(db);
  const rateLimits = providerRateLimitService(db);

  async function assertExistingCompany(companyId: string, res: { status(code: number): { json(body: unknown): void } }) {
    const company = await companies.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return false;
    }
    return true;
  }

  router.get("/companies/:companyId/provider-rate-limits", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    if (!await assertExistingCompany(companyId, res)) return;
    await rateLimits.releaseExpired(new Date(), companyId);
    res.json(await rateLimits.listActive(companyId));
  });

  router.post("/companies/:companyId/provider-rate-limits/:blockId/release", async (req, res) => {
    const companyId = req.params.companyId as string;
    const blockId = req.params.blockId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    if (!await assertExistingCompany(companyId, res)) return;
    const released = await rateLimits.releaseBlock(companyId, blockId, "manual");
    if (!released) {
      res.status(404).json({ error: "Provider rate-limit block not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "provider_rate_limit.released",
      entityType: "provider_rate_limit_block",
      entityId: released.id,
      details: {
        provider: released.provider,
        adapterType: released.adapterType,
        limitKind: released.limitKind,
        modelFamily: released.modelFamily,
      },
    });
    res.json(released);
  });

  return router;
}
