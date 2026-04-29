import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issueApprovals, issues, projects } from "@paperclipai/db";
import type { HireApprovedPayload } from "@paperclipai/adapter-utils";
import type { ProjectOperatingContext } from "@paperclipai/shared";
import { findActiveServerAdapter } from "../adapters/registry.js";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { issueService } from "./issues.js";
import { heartbeatService } from "./heartbeat.js";

const HIRE_APPROVED_MESSAGE =
  "Tell your user that your hire was approved, now they should assign you a task in Paperclip or ask you to create issues.";

function asProjectOperatingContext(value: unknown): ProjectOperatingContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ProjectOperatingContext;
}

async function resolveHireContext(db: Db, input: {
  companyId: string;
  source: "join_request" | "approval";
  sourceId: string;
}): Promise<HireApprovedPayload["hireContext"]> {
  if (input.source !== "approval") return null;

  const linkedIssue = await db
    .select({
      id: issues.id,
      identifier: issues.identifier,
      title: issues.title,
      originKind: issues.originKind,
      status: issues.status,
      assigneeAgentId: issues.assigneeAgentId,
      parentId: issues.parentId,
      projectId: issues.projectId,
      projectName: projects.name,
      projectOperatingContext: projects.operatingContext,
    })
    .from(issueApprovals)
    .innerJoin(issues, eq(issueApprovals.issueId, issues.id))
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .where(and(eq(issueApprovals.companyId, input.companyId), eq(issueApprovals.approvalId, input.sourceId)))
    .then((rows) => rows[0] ?? null);

  if (!linkedIssue) return null;

  const operatingContext = asProjectOperatingContext(linkedIssue.projectOperatingContext);
  const parentIssue =
    linkedIssue.parentId && linkedIssue.originKind === "staffing_hiring"
      ? await db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
          })
          .from(issues)
          .where(and(eq(issues.companyId, input.companyId), eq(issues.id, linkedIssue.parentId)))
          .then((rows) => rows[0] ?? null)
      : null;
  const baselineIssueId = operatingContext?.baselineTrackingIssueId ?? parentIssue?.id ?? null;
  const baselineIssueIdentifier = operatingContext?.baselineTrackingIssueIdentifier ?? parentIssue?.identifier ?? null;
  const baselineIssueTitle = parentIssue?.title ?? null;
  return {
    sourceIssueId: linkedIssue.id,
    sourceIssueIdentifier: linkedIssue.identifier ?? null,
    sourceIssueTitle: linkedIssue.title ?? null,
    sourceIssueKind:
      linkedIssue.originKind === "staffing_hiring"
        ? "staffing_hiring"
        : linkedIssue.identifier && linkedIssue.identifier === baselineIssueIdentifier
          ? "baseline_tracking"
          : "other",
    sourceIssueStatus: linkedIssue.status ?? null,
    sourceIssueAssigneeAgentId: linkedIssue.assigneeAgentId ?? null,
    projectId: linkedIssue.projectId ?? null,
    projectName: linkedIssue.projectName ?? null,
    projectOverviewSummary: operatingContext?.overviewSummary ?? null,
    baselineStatus: operatingContext?.baselineStatus ?? null,
    baselineIssueId,
    baselineTrackingIssueIdentifier: baselineIssueIdentifier,
    baselineIssueTitle,
  };
}

function buildHireApprovedMessage(hireContext: HireApprovedPayload["hireContext"]): string {
  if (!hireContext) return HIRE_APPROVED_MESSAGE;

  const lines = [
    "Tell your user that your hire was approved.",
  ];

  if (hireContext.projectName) {
    lines.push(`You were hired for project "${hireContext.projectName}".`);
  }
  if (hireContext.sourceIssueKind === "staffing_hiring" && (hireContext.sourceIssueIdentifier || hireContext.sourceIssueTitle)) {
    lines.push(
      `You were hired through staffing issue ${hireContext.sourceIssueIdentifier ?? hireContext.sourceIssueId}` +
      (hireContext.sourceIssueTitle ? ` (${hireContext.sourceIssueTitle})` : "."),
    );
  } else if (hireContext.sourceIssueIdentifier || hireContext.sourceIssueTitle) {
    lines.push(
      `This hire came from issue ${hireContext.sourceIssueIdentifier ?? hireContext.sourceIssueId}` +
      (hireContext.sourceIssueTitle ? ` (${hireContext.sourceIssueTitle})` : "."),
    );
  }
  if (hireContext.baselineStatus === "accepted" && hireContext.baselineTrackingIssueIdentifier) {
    lines.push(
      `Read the accepted repository baseline context first, especially ${hireContext.baselineTrackingIssueIdentifier} and any PROJECT_PACKET.md in your instructions bundle.`,
    );
  }
  if (hireContext.projectOverviewSummary) {
    lines.push(`Project summary: ${hireContext.projectOverviewSummary}`);
  }
  lines.push(
    hireContext.sourceIssueKind === "staffing_hiring"
      ? "After orienting yourself, publish your initial technical onboarding in the staffing issue and then ask your user for the first concrete task if needed."
      : "After orienting yourself, tell your user you are ready for a task or ask whether they want you to take over the linked issue.",
  );
  return lines.join(" ");
}

function buildHireApprovedIssueComment(input: {
  agentName: string;
  hireContext: NonNullable<HireApprovedPayload["hireContext"]>;
}) {
  const lines = [
    "## Hire Approved",
    "",
    `${input.agentName} was approved for this workstream.`,
  ];
  if (input.hireContext.projectName) {
    lines.push(`Project: ${input.hireContext.projectName}`);
  }
  if (input.hireContext.sourceIssueKind === "staffing_hiring") {
    lines.push("This staffing issue is now the operational handoff thread for the new hire.");
  }
  if (input.hireContext.baselineStatus === "accepted" && input.hireContext.baselineTrackingIssueIdentifier) {
    lines.push(
      `Canonical technical reference: ${input.hireContext.baselineTrackingIssueIdentifier}` +
      (input.hireContext.baselineIssueTitle ? ` (${input.hireContext.baselineIssueTitle}).` : "."),
    );
  }
  lines.push("They were also told to read any PROJECT_PACKET.md shipped in their instructions bundle before taking over work.");
  lines.push(
    input.hireContext.sourceIssueKind === "staffing_hiring"
      ? "Next step: let them publish the first technical onboarding comment here, then continue the concrete task discussion in this issue."
      : "Next step: assign them a concrete task here or ask whether they should take ownership of this issue.",
  );
  return lines.join("\n");
}

export interface NotifyHireApprovedInput {
  companyId: string;
  agentId: string;
  source: "join_request" | "approval";
  sourceId: string;
  approvedAt?: Date;
}

/**
 * Invokes the adapter's onHireApproved hook when an agent is approved (join-request or hire_agent approval).
 * Failures are non-fatal: we log and write to activity, never throw.
 */
export async function notifyHireApproved(
  db: Db,
  input: NotifyHireApprovedInput,
): Promise<void> {
  const { companyId, agentId, source, sourceId } = input;
  const approvedAt = input.approvedAt ?? new Date();

  const row = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
    .then((rows) => rows[0] ?? null);

  if (!row) {
    logger.warn({ companyId, agentId, source, sourceId }, "hire hook: agent not found in company, skipping");
    return;
  }

  const adapterType = row.adapterType ?? "process";
  const adapter = findActiveServerAdapter(adapterType);
  const onHireApproved = adapter?.onHireApproved;

  const hireContext = await resolveHireContext(db, { companyId, source, sourceId });

  const payload: HireApprovedPayload = {
    companyId,
    agentId,
    agentName: row.name,
    adapterType,
    source,
    sourceId,
    approvedAt: approvedAt.toISOString(),
    message: buildHireApprovedMessage(hireContext),
    hireContext,
  };

  const adapterConfig =
    typeof row.adapterConfig === "object" && row.adapterConfig !== null && !Array.isArray(row.adapterConfig)
      ? (row.adapterConfig as Record<string, unknown>)
      : {};
  const issuesSvc = issueService(db);
  const heartbeat = heartbeatService(db);

  try {
    const result = onHireApproved
      ? await onHireApproved(payload, adapterConfig)
      : { ok: true as const };
    if (result.ok) {
      if (hireContext?.sourceIssueId) {
        if (hireContext.sourceIssueKind === "staffing_hiring") {
          try {
            const shouldPromoteFromBacklog = hireContext.sourceIssueStatus === "backlog";
            const shouldAssignIssue = hireContext.sourceIssueAssigneeAgentId !== agentId;
            if (shouldPromoteFromBacklog || shouldAssignIssue) {
              const updatedIssue = await issuesSvc.update(hireContext.sourceIssueId, {
                assigneeAgentId: agentId,
                ...(shouldPromoteFromBacklog ? { status: "todo" } : {}),
              });
              if (updatedIssue) {
                await logActivity(db, {
                  companyId,
                  actorType: "system",
                  actorId: "hire_hook",
                  action: "issue.updated",
                  entityType: "issue",
                  entityId: updatedIssue.id,
                  details: {
                    identifier: updatedIssue.identifier,
                    assigneeAgentId: updatedIssue.assigneeAgentId,
                    ...(shouldPromoteFromBacklog ? { status: updatedIssue.status } : {}),
                    source: "hire_approved_staffing_assignment",
                    _previous: {
                      assigneeAgentId: hireContext.sourceIssueAssigneeAgentId ?? null,
                      ...(shouldPromoteFromBacklog ? { status: hireContext.sourceIssueStatus ?? null } : {}),
                    },
                  },
                });
              }
            }
          } catch (err) {
            logger.warn(
              { err, companyId, agentId, source, sourceId, issueId: hireContext.sourceIssueId },
              "hire hook: failed to assign staffing issue to newly approved hire",
            );
          }
        }
        try {
          await issuesSvc.addComment(
            hireContext.sourceIssueId,
            buildHireApprovedIssueComment({
              agentName: row.name,
              hireContext,
            }),
            {},
          );
        } catch (err) {
          logger.warn(
            { err, companyId, agentId, source, sourceId, issueId: hireContext.sourceIssueId },
            "hire hook: failed to post hire-approved issue comment",
          );
        }
        try {
          await heartbeat.wakeup(agentId, {
            source: "assignment",
            triggerDetail: "system",
            reason: "issue_assigned",
            payload: {
              issueId: hireContext.sourceIssueId,
              mutation: "hire_approved",
            },
            requestedByActorType: "system",
            requestedByActorId: "hire_hook",
            contextSnapshot: {
              issueId: hireContext.sourceIssueId,
              taskId: hireContext.sourceIssueId,
              source: "hire.approved",
              wakeReason: "issue_assigned",
              hireApproved: true,
              forceFreshSession: true,
            },
          });
        } catch (err) {
          logger.warn(
            { err, companyId, agentId, source, sourceId, issueId: hireContext.sourceIssueId },
            "hire hook: failed to wake newly approved hire on source issue",
          );
        }
      }
      await logActivity(db, {
        companyId,
        actorType: "system",
        actorId: "hire_hook",
        action: "hire_hook.succeeded",
        entityType: "agent",
        entityId: agentId,
        details: { source, sourceId, adapterType },
      });
      return;
    }

    logger.warn(
      { companyId, agentId, adapterType, source, sourceId, error: result.error, detail: result.detail },
      "hire hook: adapter returned failure",
    );
    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "hire_hook",
      action: "hire_hook.failed",
      entityType: "agent",
      entityId: agentId,
      details: { source, sourceId, adapterType, error: result.error, detail: result.detail },
    });
  } catch (err) {
    logger.error(
      { err, companyId, agentId, adapterType, source, sourceId },
      "hire hook: adapter threw",
    );
    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "hire_hook",
      action: "hire_hook.error",
      entityType: "agent",
      entityId: agentId,
      details: {
        source,
        sourceId,
        adapterType,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
