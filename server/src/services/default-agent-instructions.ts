import fs from "node:fs/promises";
import type { ProjectOperatingContext } from "@paperclipai/shared";

const DEFAULT_AGENT_BUNDLE_FILES = {
  default: ["AGENTS.md"],
  ceo: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
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
  };
  const existingAgents = nextFiles["AGENTS.md"] ?? "";
  const projectPacketSection = existingAgents.includes(PROJECT_PACKET_FILE_NAME)
    ? ""
    : "## Project packet\n" +
      `If \`${PROJECT_PACKET_FILE_NAME}\` exists beside this file, read it before planning or delegating project work.\n`;
  const roleSpecificGuidance = buildRoleSpecificProjectPacketGuidance(input.role);
  if (projectPacketSection || roleSpecificGuidance) {
    nextFiles["AGENTS.md"] = [
      existingAgents.trimEnd(),
      projectPacketSection,
      roleSpecificGuidance,
    ]
      .filter(Boolean)
      .join("\n\n") + "\n";
  }
  return nextFiles;
}
