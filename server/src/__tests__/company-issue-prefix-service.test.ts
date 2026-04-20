import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  createDb,
  instanceSettings,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyService } from "../services/companies.ts";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company issue prefix tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("company issue prefix configuration", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-prefix-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(instanceSettings);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("persists an explicit setup issue prefix and uses it for new issue identifiers", async () => {
    const company = await companyService(db).create({
      name: "Prop4You",
      issuePrefix: "p4y",
    });

    expect(company.issuePrefix).toBe("P4Y");

    const issue = await issueService(db).create(company.id, {
      title: "Configure the company issue prefix",
      status: "todo",
      priority: "medium",
      createdByUserId: "user-1",
    });

    expect(issue.issueNumber).toBe(1);
    expect(issue.identifier).toBe("P4Y-1");
  });

  it("keeps the standard derived fallback when setup omits issue prefix", async () => {
    const company = await companyService(db).create({
      name: "Paperclip",
    });

    expect(company.issuePrefix).toBe("PAP");
  });

  it("does not auto-suffix an explicit duplicate setup issue prefix", async () => {
    await companyService(db).create({
      name: "Prop4You",
      issuePrefix: "P4Y",
    });

    await expect(
      companyService(db).create({
        name: "Another Company",
        issuePrefix: "p4y",
      }),
    ).rejects.toThrow(/issue prefix/i);
  });

  it("still auto-suffixes duplicate fallback prefixes when setup omits issue prefix", async () => {
    const first = await companyService(db).create({
      name: "Paperclip",
    });
    const second = await companyService(db).create({
      name: "Paper Crane",
    });

    expect(first.issuePrefix).toBe("PAP");
    expect(second.issuePrefix).toBe("PAPA");
  });
});
