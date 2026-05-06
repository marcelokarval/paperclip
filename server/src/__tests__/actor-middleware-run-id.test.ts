import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { actorMiddleware } from "../middleware/auth.js";
import { verifyLocalAgentJwt } from "../agent-auth-jwt.js";

vi.mock("../services/board-auth.js", () => ({
  boardAuthService: () => ({
    findBoardApiKeyByToken: vi.fn(async () => null),
    resolveBoardAccess: vi.fn(),
    touchBoardApiKey: vi.fn(),
  }),
}));

vi.mock("../agent-auth-jwt.js", () => ({
  verifyLocalAgentJwt: vi.fn(),
}));

const VALID_RUN_ID = "99999999-9999-4999-8999-999999999999";
const CLAIM_RUN_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";

function appWithAuth(db: Db) {
  const app = express();
  app.use(actorMiddleware(db, { deploymentMode: "local_trusted" }));
  app.get("/actor", (req, res) => {
    res.json(req.actor);
  });
  return app;
}

function jwtDb() {
  let selectCount = 0;
  return {
    select: vi.fn(() => {
      selectCount += 1;
      const rows =
        selectCount === 1
          ? []
          : [
              {
                id: AGENT_ID,
                companyId: COMPANY_ID,
                status: "active",
              },
            ];
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(rows)),
        })),
      };
    }),
  } as unknown as Db;
}

function mockJwtRunId(runId: string) {
  vi.mocked(verifyLocalAgentJwt).mockReturnValue({
    sub: AGENT_ID,
    company_id: COMPANY_ID,
    adapter_type: "codex-local",
    run_id: runId,
    iat: 1,
    exp: 9_999_999_999,
  });
}

describe("actorMiddleware run id sanitization", () => {
  beforeEach(() => {
    vi.mocked(verifyLocalAgentJwt).mockReset();
  });

  it("propagates a valid UUID X-Paperclip-Run-Id header", async () => {
    const res = await request(appWithAuth({} as Db)).get("/actor").set("X-Paperclip-Run-Id", VALID_RUN_ID);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "board",
      runId: VALID_RUN_ID,
      source: "local_implicit",
    });
  });

  it("drops a descriptive X-Paperclip-Run-Id header instead of erroring", async () => {
    const res = await request(appWithAuth({} as Db))
      .get("/actor")
      .set("X-Paperclip-Run-Id", "subagent:cleanup-2026-05-04");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "board",
      source: "local_implicit",
    });
    expect(res.body).not.toHaveProperty("runId");
  });

  it("uses a valid UUID run_id claim for agent_jwt when no header is present", async () => {
    mockJwtRunId(CLAIM_RUN_ID);

    const res = await request(appWithAuth(jwtDb())).get("/actor").set("Authorization", "Bearer local-agent-jwt");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "agent",
      agentId: AGENT_ID,
      companyId: COMPANY_ID,
      runId: CLAIM_RUN_ID,
      source: "agent_jwt",
    });
  });

  it("drops a descriptive run_id claim for agent_jwt instead of erroring", async () => {
    mockJwtRunId("manual:claim-cleanup-2026-05-04");

    const res = await request(appWithAuth(jwtDb())).get("/actor").set("Authorization", "Bearer local-agent-jwt");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "agent",
      agentId: AGENT_ID,
      companyId: COMPANY_ID,
      source: "agent_jwt",
    });
    expect(res.body).not.toHaveProperty("runId");
  });

  it("falls back from an invalid header to a valid agent_jwt run_id claim", async () => {
    mockJwtRunId(CLAIM_RUN_ID);

    const res = await request(appWithAuth(jwtDb()))
      .get("/actor")
      .set("Authorization", "Bearer local-agent-jwt")
      .set("X-Paperclip-Run-Id", "subagent:cleanup-2026-05-04");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "agent",
      runId: CLAIM_RUN_ID,
      source: "agent_jwt",
    });
  });
});
