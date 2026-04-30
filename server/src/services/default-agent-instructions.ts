import fs from "node:fs/promises";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import type { ProjectOperatingContext } from "@paperclipai/shared";

const DEFAULT_AGENT_BUNDLE_FILES = {
  default: ["AGENTS.md"],
  ceo: [
    "AGENTS.md",
    "CONTEXT_BOUNDARIES.md",
    "DECISION_GATES.md",
    "HEARTBEAT.md",
    "HIRING_POLICY.md",
    "ORG_OPERATING_MODEL.md",
    "SELF_IMPROVEMENT.md",
    "SOUL.md",
    "TOOLS.md",
    "WORKFLOW_PLAYBOOK.md",
  ],
} as const;

type DefaultAgentBundleRole = keyof typeof DEFAULT_AGENT_BUNDLE_FILES;
const PROJECT_PACKET_FILE_NAME = "PROJECT_PACKET.md";

function resolveDefaultAgentBundleUrl(role: DefaultAgentBundleRole, fileName: string) {
  return new URL(`../onboarding-assets/${role}/${fileName}`, import.meta.url);
}

export async function loadDefaultAgentInstructionsBundle(role: DefaultAgentBundleRole): Promise<Record<string, string>> {
  const fileNames = DEFAULT_AGENT_BUNDLE_FILES[role];
  const entries = await Promise.all(
    fileNames.map(async (fileName) => {
      const content = await fs.readFile(resolveDefaultAgentBundleUrl(role, fileName), "utf8");
      return [fileName, content] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function resolveDefaultAgentInstructionsBundleRole(role: string): DefaultAgentBundleRole {
  return role === "ceo" ? "ceo" : "default";
}

function formatBulletList(values: string[], emptyText: string) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : `- ${emptyText}`;
}

function formatIssueRoutingLabels(context: ProjectOperatingContext) {
  return context.labelCatalog.length > 0
    ? context.labelCatalog
        .map((label) => `- \`${label.name}\`: ${label.description}`)
        .join("\n")
    : "- No accepted label catalog is recorded for this project.";
}

function formatOwnershipAreas(context: ProjectOperatingContext) {
  return context.ownershipAreas.length > 0
    ? context.ownershipAreas
        .map((area) => {
          const recommendedLabels = area.recommendedLabels ?? [];
          const labels = recommendedLabels.length > 0
            ? ` Recommended labels: ${recommendedLabels.map((label) => `\`${label}\``).join(", ")}.`
            : "";
          return `- ${area.name}: ${area.paths.join(", ") || "no paths recorded."}${labels}`;
        })
        .join("\n")
    : "- No ownership areas are recorded for this project.";
}

export function buildIssueRoutingInstructionsFile(input: {
  role: string;
  projectName: string;
  operatingContext: ProjectOperatingContext;
}): string {
  const context = input.operatingContext;
  return [
    "# Issue Routing",
    "",
    `Project: ${input.projectName}`,
    context.baselineTrackingIssueIdentifier
      ? `Baseline issue: ${context.baselineTrackingIssueIdentifier}`
      : "Baseline issue: none recorded",
    `Generated for role: ${input.role}`,
    "",
    "## Purpose",
    "",
    "This file is project-derived operating knowledge for issue labels, routing, review, and verification.",
    "Use it before creating, assigning, reviewing, or decomposing project issues.",
    "",
    "## Label Catalog",
    "",
    formatIssueRoutingLabels(context),
    "",
    "## Ownership Areas",
    "",
    formatOwnershipAreas(context),
    "",
    "## Verification Defaults",
    "",
    formatBulletList(context.verificationCommands.map((entry) => `\`${entry}\``), "No verification defaults recorded."),
    "",
    "## Canonical Docs",
    "",
    formatBulletList(context.canonicalDocs.map((entry) => `\`${entry}\``), "No canonical docs recorded."),
    "",
    "## Routing Guidance",
    "",
    formatBulletList(context.operatingGuidance, "No operating guidance recorded."),
    "",
    "## Enforcement Rules",
    "",
    "- Do not invent labels outside this catalog unless the operator or project owner explicitly adds them.",
    "- If the company label list is empty or missing these labels, ask for label sync before creating implementation issues.",
    "- Keep repository baseline issues as context; do not turn them into backlog decomposition.",
    "- Use review for technical correctness and approval for operator/business decisions; do not collapse the two.",
  ].join("\n") + "\n";
}

function formatModelList(models: AdapterModel[]) {
  return models.length > 0
    ? models.map((model) => `- \`${model.id}\`${model.label && model.label !== model.id ? ` - ${model.label}` : ""}`).join("\n")
    : "- No models were discovered. Use the configured adapter fallback and refresh this file before hiring.";
}

function codexRoutingPolicy(adapterType: string, modelIds: string[]) {
  if (adapterType !== "codex_local") {
    return [
      "## Routing Policy",
      "",
      "- Use this adapter's discovered catalog as the local source of truth before hiring or reconfiguring agents.",
      "- If the catalog is empty, refresh adapter discovery before making staffing decisions.",
      "- Do not infer unsupported model or reasoning-effort values from memory.",
    ].join("\n");
  }

  const has55 = modelIds.includes("gpt-5.5");
  const has54 = modelIds.includes("gpt-5.4");
  const hasSpark = modelIds.includes("gpt-5.3-codex-spark");

  return [
    "## Routing Policy",
    "",
    "- CEO strategic technical review: prefer `gpt-5.5` with `high` reasoning when available.",
    "- CTO architecture, staffing policy, deep audits, and final technical review: prefer `gpt-5.5` with `high` reasoning when available.",
    "- Routine technical execution: prefer `gpt-5.4` with `medium` reasoning when available.",
    "- Fast bounded exploration, narrow edits, and parallel micro-tasks: prefer `gpt-5.3-codex-spark` with `low` or `medium` reasoning when available.",
    "- Reserve `xhigh` for rare, ambiguous, high-consequence synthesis. Do not use it as an agent-wide default.",
    "- If a preferred model is absent from the discovered catalog, refresh discovery first, then choose the nearest available model explicitly.",
    "",
    "## Current Availability Flags",
    "",
    `- gpt-5.5 discovered: ${has55 ? "yes" : "no"}`,
    `- gpt-5.4 discovered: ${has54 ? "yes" : "no"}`,
    `- gpt-5.3-codex-spark discovered: ${hasSpark ? "yes" : "no"}`,
    "- Reasoning efforts to enforce for Codex-local hires: `low`, `medium`, `high`, `xhigh` only when supported by the selected model.",
  ].join("\n");
}

export function buildOperatingModelsInstructionsFile(input: {
  agentName: string;
  role: string;
  adapterType: string;
  models: AdapterModel[];
  auditedAt?: Date;
}): string {
  const auditedAt = (input.auditedAt ?? new Date()).toISOString();
  const modelIds = input.models.map((model) => model.id);

  return [
    "# Operating Models",
    "",
    `Last generated: ${auditedAt}`,
    `Agent: ${input.agentName}`,
    `Role: ${input.role}`,
    `Adapter: ${input.adapterType}`,
    "",
    "## Purpose",
    "",
    "This file is agent-owned operating knowledge. It belongs in the managed instructions bundle, not in the project repository.",
    "Use it when hiring, configuring, reviewing, or refining agents. If model discovery changes, refresh this file before making staffing decisions.",
    "",
    "## Discovered Models",
    "",
    formatModelList(input.models),
    "",
    codexRoutingPolicy(input.adapterType, modelIds),
    "",
    "## Enforcement Rules",
    "",
    "- Treat this file as the current provider/model capability snapshot for this agent.",
    "- Do not create project repository docs for general model-routing policy unless the board explicitly asks for project documentation.",
    "- When creating or updating a technical hire, cite the selected model, reasoning effort, and why that pairing matches the task shape.",
    "- When this file is stale, incomplete, or contradicted by live adapter discovery, propose a HITL update before changing hiring defaults.",
  ].join("\n") + "\n";
}

function buildRoleSpecificProjectPacketGuidance(role: string) {
  if (role === "ceo") {
    return [
      "## Baseline recovery guardrails",
      "If `PROJECT_PACKET.md` exists and it references an accepted repository baseline issue:",
      "1. Treat that baseline issue as a read-only context and decision thread unless the operator explicitly asked for execution work.",
      "2. On `process_lost_retry` or other recovery wakes, re-check the live issue state before claiming a delegation, hire, blocker, or control-plane outage.",
      "3. Do not say work was routed to the CTO path unless you actually created the hire, issue, or reassignment in Paperclip.",
      "4. Do not claim the Paperclip control plane was unavailable unless you have direct evidence from a failed Paperclip API call in this same run.",
      "5. A failed local probe such as `curl`, `heartbeat-context`, or another shell command is not enough to conclude the Paperclip control plane was down; treat it as a local probe failure unless the actual Paperclip mutation you needed also failed.",
      "6. On an issue-scoped wake, use the inline wake payload plus managed instructions as the primary context. Do not refetch `/api/issues/{id}/heartbeat-context`, `/api/agents/me`, or assignment lists by raw `curl` unless the wake explicitly requires broader history or the actual mutation depends on it.",
      "7. If `PAPERCLIP_DIRECT_API_DISABLED=true`, do not issue any direct Paperclip API `curl` calls in this run, even if `fallbackFetchNeeded` is true.",
      "8. In that mode, do not fetch `/api/issues/{id}`, `/api/issues/{id}/comments`, or patch the issue directly. Use the inline wake payload, managed instructions, repository evidence, and the final Paperclip-persisted summary instead.",
      "9. Do not say you could not update the issue thread in your final issue comment. That final comment is itself the thread update; mention only the narrower failed probe or mutation, if any.",
      "10. If baseline guardrails forbid new issues or hires, keep the output in the same issue as an executive decision note, not a fictional handoff.",
      "11. For repo-first baseline reviews, separate `repository context accepted` from `execution clarifications still open`.",
      "12. If the baseline is strong enough for a first CTO hire, say so explicitly even when runtime, env, verification, or bootstrap ambiguities remain.",
      "13. In that case, recommend this sequence: accept repository context, then generate a CTO hiring brief; treat the remaining ambiguities as CTO onboarding clarifications, not a pre-hire blocker.",
      "14. Do not require an operator freshness note, execution contract, or full runbook before the first CTO hire when the baseline is already strong enough for safe CTO onboarding.",
      "15. Do not phrase open clarifications as 'after that, delegation can proceed safely' if the repository context is already sufficient for the first CTO.",
      "16. Only tell the operator to finish a full runbook or execution contract before hiring when the repo context is too weak even for a CTO to safely onboard.",
      "17. When in doubt, comment only confirmed facts, the remaining decision, and the next single operator action.",
    ].join("\n");
  }
  if (role !== "cto") return "";
  return [
    "## Technical onboarding",
    "If `PROJECT_PACKET.md` exists, treat it as your initial technical brief.",
    "Before you implement or delegate anything technical:",
    "1. Read the packet and the referenced baseline issue.",
    "2. Confirm the stack, docs, verification commands, ownership areas, and issue guidance.",
    "3. Convert that context into a concise technical plan in your first issue comment before changing code.",
    "4. On staffing-hire or issue-scoped onboarding wakes, prefer your first final run response as that required technical onboarding comment instead of blocking on raw `curl`, health probes, or ad-hoc control-plane checks.",
    "5. Keep follow-up work anchored to the same source issue or baseline thread unless there is a clear reason to branch.",
  ].join("\n");
}

function renderExecutiveProjectPacket(projectName: string, context: ProjectOperatingContext): string | null {
  const packet = context.executiveProjectPacket;
  if (!packet) return null;

  return [
    "# Project Packet",
    "",
    `Project: ${projectName}`,
    context.baselineTrackingIssueIdentifier
      ? `Baseline issue: ${context.baselineTrackingIssueIdentifier}`
      : "Baseline issue: none recorded",
    "",
    "## Summary",
    packet.projectSummary,
    "",
    "## Stack signals",
    formatBulletList(packet.stackSummary, "No stack signals recorded."),
    "",
    "## Docs to read first",
    formatBulletList(packet.docsToReadFirst, "No canonical docs recorded."),
    "",
    "## Top risks",
    formatBulletList(packet.topRisks, "No top risks recorded."),
    "",
    "## Top gaps",
    formatBulletList(packet.topGaps, "No top gaps recorded."),
    "",
    "## Operating guidance",
    formatBulletList(packet.operatingGuidance, "No additional operating guidance recorded."),
    "",
    "## Hiring signals",
    formatBulletList(packet.hiringSignals.map((entry) => entry.toUpperCase()), "No hiring signals recorded."),
  ].join("\n");
}

function renderTechnicalProjectPacket(projectName: string, context: ProjectOperatingContext): string | null {
  const packet = context.technicalProjectPacket;
  if (!packet) return null;

  return [
    "# Project Packet",
    "",
    `Project: ${projectName}`,
    context.baselineTrackingIssueIdentifier
      ? `Baseline issue: ${context.baselineTrackingIssueIdentifier}`
      : "Baseline issue: none recorded",
    "",
    "## Summary",
    packet.projectSummary,
    "",
    "## Stack signals",
    formatBulletList(packet.stackSignals, "No stack signals recorded."),
    "",
    "## Canonical docs",
    formatBulletList(packet.canonicalDocs, "No canonical docs recorded."),
    "",
    "## Verification commands",
    formatBulletList(packet.verificationCommands.map((entry) => `\`${entry}\``), "No verification commands recorded."),
    "",
    "## Ownership areas",
    packet.ownershipAreas.length > 0
      ? packet.ownershipAreas.map((area) => `- ${area.name}: ${area.paths.join(", ") || "no paths recorded"}`).join("\n")
      : "- No ownership areas recorded.",
    "",
    "## Label guidance",
    packet.labelCatalog.length > 0
      ? packet.labelCatalog.map((label) => `- ${label.name}: ${label.description}`).join("\n")
      : "- No label guidance recorded.",
    "",
    "## Issue guidance",
    formatBulletList(packet.issueGuidance, "No issue guidance recorded."),
  ].join("\n");
}

export function buildProjectPacketInstructionsBundle(input: {
  role: string;
  projectName: string;
  operatingContext: ProjectOperatingContext | null | undefined;
  files: Record<string, string>;
}): Record<string, string> {
  const operatingContext = input.operatingContext ?? null;
  if (!operatingContext || operatingContext.baselineStatus !== "accepted") return input.files;

  const packetContent =
    input.role === "ceo"
      ? renderExecutiveProjectPacket(input.projectName, operatingContext)
      : input.role === "cto"
        ? renderTechnicalProjectPacket(input.projectName, operatingContext)
        : null;
  if (!packetContent) return input.files;

  const nextFiles: Record<string, string> = {
    ...input.files,
    [PROJECT_PACKET_FILE_NAME]: packetContent,
    "ISSUE_ROUTING.md": buildIssueRoutingInstructionsFile({
      role: input.role,
      projectName: input.projectName,
      operatingContext,
    }),
  };
  const existingAgents = nextFiles["AGENTS.md"] ?? "";
  const projectPacketSection = existingAgents.includes(PROJECT_PACKET_FILE_NAME)
    ? ""
    : "## Project packet\n" +
      `If \`${PROJECT_PACKET_FILE_NAME}\` exists beside this file, read it before planning or delegating project work.\n`;
  const issueRoutingSection = existingAgents.includes("ISSUE_ROUTING.md")
    ? ""
    : "## Issue routing\n" +
      "If `ISSUE_ROUTING.md` exists beside this file, read it before creating, assigning, labeling, reviewing, or decomposing project issues.\n";
  const roleSpecificGuidance = buildRoleSpecificProjectPacketGuidance(input.role);
  if (projectPacketSection || issueRoutingSection || roleSpecificGuidance) {
    nextFiles["AGENTS.md"] = [
      existingAgents.trimEnd(),
      projectPacketSection,
      issueRoutingSection,
      roleSpecificGuidance,
    ]
      .filter(Boolean)
      .join("\n\n") + "\n";
  }
  return nextFiles;
}
