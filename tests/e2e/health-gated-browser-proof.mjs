import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.PAPERCLIP_E2E_BASE_URL?.trim() || "http://127.0.0.1:3101";
const proofPath = process.env.PAPERCLIP_BROWSER_PROOF_PATH?.trim() || "/";
const suppressAssignmentWakeup =
  process.env.PAPERCLIP_BROWSER_PROOF_SUPPRESS_ASSIGNMENT_WAKEUP?.trim().toLowerCase() === "true";
const stepsInput = process.env.PAPERCLIP_BROWSER_PROOF_STEPS?.trim();
const tmpDir = ".tmp";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactBase = `${tmpDir}/browser-proof-${stamp}`;
const healthUrl = new URL("/api/health", baseUrl).toString();
const proofUrl = new URL(proofPath, baseUrl).toString();
const chromePath = existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;

async function healthGate() {
  const attempts = [];
  let consecutiveSuccesses = 0;
  for (let i = 0; i < 12; i += 1) {
    const startedAt = new Date().toISOString();
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) });
      const body = await response.text();
      attempts.push({ startedAt, status: response.status, ok: response.ok, body: body.slice(0, 1_000) });
      if (!response.ok) throw new Error(`health returned ${response.status}`);
      consecutiveSuccesses += 1;
      if (consecutiveSuccesses >= 3) {
        await writeFile(`${artifactBase}.health.json`, JSON.stringify({ healthUrl, attempts }, null, 2));
        return;
      }
    } catch (error) {
      consecutiveSuccesses = 0;
      attempts.push({
        startedAt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await writeFile(`${artifactBase}.health.json`, JSON.stringify({ healthUrl, attempts }, null, 2));
  throw new Error("health gate did not reach 3 consecutive successful checks");
}

async function loadSteps() {
  if (!stepsInput) return [];
  const raw = stepsInput.startsWith("[") || stepsInput.startsWith("{")
    ? stepsInput
    : await readFile(stepsInput, "utf8");
  const parsed = JSON.parse(raw);
  const steps = Array.isArray(parsed) ? parsed : parsed.steps;
  if (!Array.isArray(steps)) {
    throw new Error("PAPERCLIP_BROWSER_PROOF_STEPS must be a JSON array or an object with a steps array");
  }
  return steps;
}

function readTimeout(step) {
  return typeof step.timeoutMs === "number" && Number.isFinite(step.timeoutMs)
    ? step.timeoutMs
    : 15_000;
}

function readLocatorOptions(step) {
  return {
    exact: step.exact === true,
  };
}

async function runProofStep(page, step, index) {
  const action = typeof step.action === "string" ? step.action : "";
  const timeout = readTimeout(step);

  switch (action) {
    case "clickRole":
      await page.getByRole(step.role, { name: step.name, ...readLocatorOptions(step) }).click({ timeout });
      return;
    case "clickText":
      await page.getByText(step.text, readLocatorOptions(step)).click({ timeout });
      return;
    case "clickSelector":
      await page.locator(step.selector).click({ timeout });
      return;
    case "fillRole":
      await page.getByRole(step.role, { name: step.name, ...readLocatorOptions(step) }).fill(step.value ?? "", { timeout });
      return;
    case "fillSelector":
      await page.locator(step.selector).fill(step.value ?? "", { timeout });
      return;
    case "waitForRole":
      await page.getByRole(step.role, { name: step.name, ...readLocatorOptions(step) }).waitFor({ timeout });
      return;
    case "waitForText":
      await page.getByText(step.text, readLocatorOptions(step)).waitFor({ timeout });
      return;
    case "waitForSelector":
      await page.locator(step.selector).waitFor({ timeout });
      return;
    case "waitForUrl":
      await page.waitForURL(step.url, { timeout });
      return;
    case "waitForLoadState":
      await page.waitForLoadState(step.state ?? "networkidle", { timeout });
      return;
    case "screenshot":
      await page.screenshot({
        path: `${artifactBase}.step-${String(index + 1).padStart(2, "0")}${step.name ? `-${String(step.name).replace(/[^a-z0-9_-]+/gi, "-")}` : ""}.png`,
        fullPage: step.fullPage !== false,
      });
      return;
    default:
      throw new Error(`Unsupported browser-proof step action: ${action || "<missing>"}`);
  }
}

await mkdir(tmpDir, { recursive: true });
await healthGate();

const consoleMessages = [];
const networkProblems = [];
const stepResults = [];
const steps = await loadSteps();
const browser = await chromium.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : {}),
});

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkProblems.push({
        type: "response",
        status: response.status(),
        url: response.url(),
        method: response.request().method(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    networkProblems.push({
      type: "requestfailed",
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? null,
    });
  });
  if (suppressAssignmentWakeup) {
    await page.route("**/api/issues/*/org-learning-apply-issue", async (route) => {
      const request = route.request();
      if (request.method().toUpperCase() !== "POST") {
        await route.continue();
        return;
      }
      const payload = JSON.parse(request.postData() || "{}");
      await route.continue({
        postData: JSON.stringify({ ...payload, suppressAssignmentWakeup: true }),
        headers: {
          ...request.headers(),
          "content-type": "application/json",
        },
      });
    });
  }

  let proofFailure = null;
  try {
    await page.goto(proofUrl, { waitUntil: "networkidle", timeout: 45_000 });
    for (const [index, step] of steps.entries()) {
      const startedAt = new Date().toISOString();
      try {
        await runProofStep(page, step, index);
        stepResults.push({ index, action: step.action, status: "passed", startedAt, finishedAt: new Date().toISOString() });
      } catch (error) {
        stepResults.push({
          index,
          action: step.action ?? null,
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
  } catch (error) {
    proofFailure = error instanceof Error ? error.message : String(error);
  }

  await page.screenshot({ path: `${artifactBase}.png`, fullPage: true });

  const proof = {
    baseUrl,
    proofUrl,
    healthUrl,
    suppressAssignmentWakeup,
    stepCount: steps.length,
    stepResults,
    chromePath: chromePath ?? "playwright-bundled-or-channel-default",
    consoleMessages,
    networkProblems,
    proofFailure,
    screenshot: `${artifactBase}.png`,
  };
  await writeFile(`${artifactBase}.json`, JSON.stringify(proof, null, 2));

  const consoleErrors = consoleMessages.filter((message) => ["error", "warning"].includes(message.type));
  if (proofFailure) {
    throw new Error(`browser proof failed: ${proofFailure}`);
  }
  if (consoleErrors.length > 0 || networkProblems.length > 0) {
    throw new Error(`browser proof found ${consoleErrors.length} console warnings/errors and ${networkProblems.length} network problems`);
  }
} finally {
  await browser.close();
}
