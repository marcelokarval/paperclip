import { test, expect, request as pwRequest, type APIRequestContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE_URL = process.env.PAPERCLIP_E2E_BASE_URL?.trim() || "http://127.0.0.1:3101";
const COMPANY_NAME = `E2E-RepoFirst-${Date.now()}`;
const PROJECT_NAME = "Launch Fullstack";
const WORKSPACE_NAME = "launch-fullstack";

interface RepoFirstContext {
  board: APIRequestContext;
  companyId: string;
  companyPrefix: string;
  projectId: string;
  projectUrlKey: string;
  workspaceId: string;
  baselineIssueId: string;
  baselineIssueIdentifier: string;
  repoDir: string;
}

interface HiringIssueRef {
  id: string;
  identifier: string;
}

function attachBrowserProofGuards(page: Page) {
  const consoleProblems: string[] = [];
  const failingResponses: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      failingResponses.push(`${status} ${response.url()}`);
    }
  });
  return {
    assertClean() {
      expect(consoleProblems).toEqual([]);
      expect(failingResponses).toEqual([]);
    },
  };
}

async function createFixtureRepo(): Promise<string> {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "paperclip-repo-first-"));
  await mkdir(path.join(repoDir, "docs", "reference"), { recursive: true });
  await mkdir(path.join(repoDir, "src", "app"), { recursive: true });

  await writeFile(
    path.join(repoDir, "package.json"),
    JSON.stringify(
      {
        name: "launch-fullstack",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          lint: "next lint",
          test: "vitest run",
        },
        dependencies: {
          next: "^15.0.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          zod: "^4.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          tailwindcss: "^4.0.0",
          vitest: "^3.0.0",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(repoDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          jsx: "preserve",
          strict: true,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(repoDir, "README.md"),
    [
      "# Launch Fullstack",
      "",
      "Existing Next.js application with dashboard, onboarding, and API flows.",
      "",
      "## Commands",
      "",
      "- `pnpm install`",
      "- `pnpm build`",
      "- `pnpm test`",
    ].join("\n"),
  );
  await writeFile(
    path.join(repoDir, "docs", "reference", "design-system.contract.md"),
    [
      "# Design System Contract",
      "",
      "This product uses a bright premium design system with dashboard and onboarding surfaces.",
    ].join("\n"),
  );
  await writeFile(
    path.join(repoDir, "docs", "reference", "verification.md"),
    [
      "# Verification",
      "",
      "- `pnpm build`",
      "- `pnpm test`",
    ].join("\n"),
  );
  await writeFile(
    path.join(repoDir, "src", "app", "page.tsx"),
    [
      "export default function Home() {",
      "  return <main>Launch Fullstack</main>;",
      "}",
    ].join("\n"),
  );

  return repoDir;
}

async function setupRepoFirstContext(): Promise<RepoFirstContext> {
  const board = await pwRequest.newContext({ baseURL: BASE_URL });
  const repoDir = await createFixtureRepo();

  const companyRes = await board.post("/api/companies", {
    data: {
      name: COMPANY_NAME,
      issuePrefix: `RF${String(Date.now()).slice(-4)}`,
    },
  });
  expect(companyRes.ok()).toBe(true);
  const company = await companyRes.json();

  const ceoRes = await board.post(`/api/companies/${company.id}/agents`, {
    data: {
      name: "CEO",
      role: "ceo",
      title: "Chief Executive Officer",
      adapterType: "process",
      adapterConfig: {
        command: process.execPath,
        args: ["-e", "process.stdout.write('done\\n')"],
      },
    },
  });
  expect(ceoRes.ok()).toBe(true);

  const projectRes = await board.post(`/api/companies/${company.id}/projects`, {
    data: { name: PROJECT_NAME },
  });
  expect(projectRes.ok()).toBe(true);
  const project = await projectRes.json();

  const workspaceRes = await board.post(`/api/projects/${project.id}/workspaces?companyId=${encodeURIComponent(company.id)}`, {
    data: {
      name: WORKSPACE_NAME,
      sourceType: "local_path",
      cwd: repoDir,
    },
  });
  expect(workspaceRes.ok()).toBe(true);
  const workspace = await workspaceRes.json();

  const refreshRes = await board.post(
    `/api/projects/${project.id}/workspaces/${workspace.id}/repository-baseline?companyId=${encodeURIComponent(company.id)}`,
    {
      data: { createTrackingIssue: true },
    },
  );
  expect(refreshRes.ok()).toBe(true);
  const refreshPayload = await refreshRes.json();
  const baselineIssue = refreshPayload.trackingIssue;
  expect(baselineIssue).toBeTruthy();

  const applyRes = await board.post(
    `/api/projects/${project.id}/workspaces/${workspace.id}/repository-baseline/apply-recommendations?companyId=${encodeURIComponent(company.id)}`,
    {
      data: {
        applyLabels: true,
        acceptIssueGuidance: true,
      },
    },
  );
  expect(applyRes.ok()).toBe(true);

  const acceptRes = await board.post(
    `/api/projects/${project.id}/workspaces/${workspace.id}/repository-baseline/accept?companyId=${encodeURIComponent(company.id)}`,
    {
      data: { acceptIssueGuidance: true },
    },
  );
  expect(acceptRes.ok()).toBe(true);

  return {
    board,
    companyId: company.id,
    companyPrefix: company.issuePrefix,
    projectId: project.id,
    projectUrlKey: project.urlKey ?? project.id,
    workspaceId: workspace.id,
    baselineIssueId: baselineIssue.id,
    baselineIssueIdentifier: baselineIssue.identifier ?? baselineIssue.id,
    repoDir,
  };
}

async function cleanupRepoFirstContext(ctx: RepoFirstContext | null) {
  if (!ctx) return;
  await ctx.board.delete(`/api/companies/${ctx.companyId}`).catch(() => {});
  await ctx.board.dispose();
  await rm(ctx.repoDir, { recursive: true, force: true }).catch(() => {});
}

async function createHiringIssueViaApi(ctx: RepoFirstContext): Promise<HiringIssueRef> {
  const createRes = await ctx.board.post(
    `/api/projects/${ctx.projectId}/workspaces/${ctx.workspaceId}/staffing/hiring-issues?companyId=${encodeURIComponent(ctx.companyId)}`,
    {
      data: { role: "cto" },
    },
  );
  expect(createRes.ok()).toBe(true);
  const payload = await createRes.json();
  return {
    id: payload.issue.id,
    identifier: payload.issue.identifier ?? payload.issue.id,
  };
}

test.describe("Repo-first staffing workflow", () => {
  let ctx: RepoFirstContext | null = null;

  test.beforeEach(async () => {
    ctx = await setupRepoFirstContext();
  });

  test.afterEach(async () => {
    await cleanupRepoFirstContext(ctx);
    ctx = null;
  });

  test("intake and configuration expose label governance and classified baseline signals without browser errors", async ({ page }) => {
    if (!ctx) throw new Error("repo-first context not initialized");
    const proof = attachBrowserProofGuards(page);

    await page.goto(`/${ctx.companyPrefix}/projects/${ctx.projectUrlKey}/intake`);

    await expect(page.getByText("Step 1.5 · Label governance")).toBeVisible();
    await expect(page.getByRole("button", { name: /sync labels and issue guidance/i })).toBeVisible();
    await expect(page.getByText("suggested").first()).toBeVisible();
    await expect(page.getByText("accepted").first()).toBeVisible();
    await expect(page.getByText("materialized").first()).toBeVisible();

    await page.goto(`/${ctx.companyPrefix}/projects/${ctx.projectUrlKey}/configuration`);

    await expect(page.getByText("Baseline gaps")).toBeVisible();
    await expect(page.getByText(/Scanner limit|Operator action|Repository risk/).first()).toBeVisible();
    await expect(page.getByText("Action:").first()).toBeVisible();

    proof.assertClean();
  });

  test("accepted repository context unlocks staffing before execution readiness and creates a CTO hiring issue", async ({ page }) => {
    if (!ctx) throw new Error("repo-first context not initialized");

    await page.goto(`/${ctx.companyPrefix}/projects/${ctx.projectUrlKey}/intake`);

    await expect(page.getByRole("heading", { name: "First technical hire" })).toBeVisible();
    await expect(page.getByText("Execution clarifications: open")).toBeVisible();
    await expect(
      page.getByText("Open execution ambiguities can travel into the CTO brief instead of blocking the first hire."),
    ).toBeVisible();

    const generateBriefButton = page.getByRole("button", { name: "Generate CTO hiring brief" });
    await expect(generateBriefButton).toBeEnabled();

    await page.getByRole("link", { name: "Open baseline issue" }).click();
    await expect(page).toHaveURL(new RegExp(`/${ctx.companyPrefix}/issues/${ctx.baselineIssueIdentifier}$`));
    await expect(
      page.getByText("Repository context is accepted. The next primary step is staffing in Project Intake."),
    ).toBeVisible();

    await page.goto(`/${ctx.companyPrefix}/projects/${ctx.projectUrlKey}/intake`);
    await expect(page).toHaveURL(new RegExp(`/${ctx.companyPrefix}/projects/${ctx.projectUrlKey}/intake$`));

    const intakeGenerateBriefButton = page.getByRole("button", { name: "Generate CTO hiring brief" });
    await expect(intakeGenerateBriefButton).toBeEnabled();
    await intakeGenerateBriefButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Open execution clarifications", { exact: true })).toBeVisible();
    await expect(
      dialog.getByText("Close the open execution clarifications as part of the first technical framing pass."),
    ).toBeVisible();

    const createHiringIssueButton = dialog.getByRole("button", { name: "Create CTO hiring issue" });
    await createHiringIssueButton.scrollIntoViewIfNeeded();
    await createHiringIssueButton.evaluate((element: HTMLButtonElement) => element.click());

    await expect
      .poll(async () => {
        const projectRes = await page.request.get(`/api/projects/${ctx!.projectId}?companyId=${encodeURIComponent(ctx!.companyId)}`);
        expect(projectRes.ok()).toBe(true);
        const project = await projectRes.json();
        return project.staffingState?.hiringIssueIdentifier ?? null;
      })
      .not.toBeNull();

    const projectRes = await page.request.get(`/api/projects/${ctx.projectId}?companyId=${encodeURIComponent(ctx.companyId)}`);
    expect(projectRes.ok()).toBe(true);
    const projectAfterHire = await projectRes.json();
    const hiringIdentifier = projectAfterHire.staffingState?.hiringIssueIdentifier;
    expect(hiringIdentifier).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(`/${ctx.companyPrefix}/issues/${String(hiringIdentifier)}$`));
    await expect(page.getByRole("heading", { name: `Hire CTO for ${PROJECT_NAME}` })).toBeVisible();
  });

  test("staffing issue can create and approve the CTO hire, assigning the issue to the new agent", async ({ page }) => {
    if (!ctx) throw new Error("repo-first context not initialized");

    const hiringIssue = await createHiringIssueViaApi(ctx);

    await page.goto(`/${ctx.companyPrefix}/issues/${hiringIssue.identifier}`);

    await expect(page.getByRole("heading", { name: `Hire CTO for ${PROJECT_NAME}` })).toBeVisible();
    await expect(page.getByText("Staffing operator actions")).toBeVisible();

    const createApprovalButton = page.getByRole("button", { name: "Create CTO approval" });
    await expect(createApprovalButton).toBeEnabled();
    await createApprovalButton.click();

    await expect
      .poll(async () => {
        const approvalsRes = await page.request.get(`/api/issues/${hiringIssue.id}/approvals`);
        expect(approvalsRes.ok()).toBe(true);
        const approvals = await approvalsRes.json();
        const approval = approvals.find((entry: { type: string }) => entry.type === "hire_agent");
        return approval?.id ?? null;
      })
      .not.toBeNull();

    const approvalsRes = await page.request.get(`/api/issues/${hiringIssue.id}/approvals`);
    expect(approvalsRes.ok()).toBe(true);
    const approvals = await approvalsRes.json();
    const approval = approvals.find((entry: { type: string }) => entry.type === "hire_agent");
    expect(approval?.id).toBeTruthy();

    const approveHireButton = page.getByRole("button", { name: "Approve CTO hire and close issue" });
    await expect(approveHireButton).toBeVisible();
    await approveHireButton.click();

    await expect
      .poll(async () => {
        const projectRes = await page.request.get(`/api/projects/${ctx!.projectId}?companyId=${encodeURIComponent(ctx!.companyId)}`);
        expect(projectRes.ok()).toBe(true);
        const project = await projectRes.json();
        return project.staffingState?.status ?? null;
      })
      .toBe("hire_approved");

    const agentsRes = await page.request.get(`/api/companies/${ctx.companyId}/agents`);
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    const cto = agents.find((agent: { role: string; status: string }) => agent.role === "cto" && agent.status !== "terminated");
    expect(cto).toBeTruthy();

    await expect
      .poll(async () => {
        const issueRes = await page.request.get(`/api/issues/${hiringIssue.id}`);
        expect(issueRes.ok()).toBe(true);
        const updatedIssue = await issueRes.json();
        return updatedIssue.status;
      })
      .toBe("done");
  });
});
