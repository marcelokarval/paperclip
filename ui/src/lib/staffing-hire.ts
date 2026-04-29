import type { Agent, Approval, Project } from "@paperclipai/shared";

const INHERITED_ADAPTER_CONFIG_KEYS_TO_STRIP = new Set([
  "instructionsBundleMode",
  "instructionsRootPath",
  "instructionsEntryFile",
  "instructionsFilePath",
  "agentsMdPath",
]);

export interface StaffingHireDraft {
  request: Record<string, unknown>;
  roleLabel: string;
  disabledReason: string | null;
}

function sanitizeInheritedAdapterConfig(config: Record<string, unknown> | null | undefined) {
  if (!config) return {};
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !INHERITED_ADAPTER_CONFIG_KEYS_TO_STRIP.has(key)),
  );
}

function findActiveRoleHolder(agents: Agent[] | null | undefined, role: string) {
  return (agents ?? []).find((agent) => agent.status !== "terminated" && agent.role === role) ?? null;
}

function findLinkedHireApproval(approvals: Approval[] | null | undefined) {
  return (approvals ?? []).find((approval) => approval.type === "hire_agent") ?? null;
}

function roleLabelFor(value: string) {
  return value === "cto" ? "CTO" : value.toUpperCase();
}

export function buildStaffingHireDraft(input: {
  issueId: string;
  project: Pick<Project, "staffingState"> | null | undefined;
  agents: Agent[] | null | undefined;
  linkedApprovals: Approval[] | null | undefined;
}): StaffingHireDraft | null {
  const recommendedRole = input.project?.staffingState?.recommendedRole ?? null;
  if (!recommendedRole) return null;

  const roleLabel = roleLabelFor(recommendedRole);
  const ceo = findActiveRoleHolder(input.agents, "ceo");
  const existingRoleHolder = findActiveRoleHolder(input.agents, recommendedRole);
  const linkedHireApproval = findLinkedHireApproval(input.linkedApprovals);

  if (!ceo) {
    return {
      roleLabel,
      disabledReason: "No active CEO is available to inherit adapter defaults for this hire.",
      request: {},
    };
  }

  if (linkedHireApproval) {
    const approvalStatusLabel =
      linkedHireApproval.status === "pending"
        ? "pending"
        : linkedHireApproval.status === "approved"
          ? "approved"
          : linkedHireApproval.status.replace(/_/g, " ");
    return {
      roleLabel,
      disabledReason: `${roleLabel} hire approval is already ${approvalStatusLabel} on this staffing issue.`,
      request: {},
    };
  }

  if (existingRoleHolder && existingRoleHolder.id !== ceo.id) {
    return {
      roleLabel,
      disabledReason: `${roleLabel} already exists as ${existingRoleHolder.name}.`,
      request: {},
    };
  }

  return {
    roleLabel,
    disabledReason: null,
    request: {
      name: roleLabel,
      role: recommendedRole,
      title: recommendedRole === "cto" ? "Chief Technology Officer" : roleLabel,
      reportsTo: ceo.id,
      capabilities:
        recommendedRole === "cto"
          ? "Own the technical execution model for the accepted baseline and staffing brief."
          : null,
      adapterType: ceo.adapterType,
      adapterConfig: sanitizeInheritedAdapterConfig(ceo.adapterConfig),
      runtimeConfig: ceo.runtimeConfig ?? {},
      budgetMonthlyCents: ceo.budgetMonthlyCents ?? 0,
      sourceIssueIds: [input.issueId],
    },
  };
}
