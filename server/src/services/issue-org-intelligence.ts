type ActivityLike = {
  id: string;
  action: string;
  actorType: string;
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
  createdAt: Date;
  details?: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function agentRef(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const type = stringValue(record.type);
  return {
    type,
    id: stringValue(record.id) ?? stringValue(record.agentId) ?? stringValue(record.userId),
    name: stringValue(record.name),
    role: stringValue(record.role),
  };
}

function executionAllowedLabel(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "yes" : "no";
  return stringValue(value);
}

export type IssueOrgIntelligenceRecord =
  | {
      id: string;
      kind: "routing";
      createdAt: Date;
      actorType: string;
      actorId: string;
      agentId: string | null;
      runId: string | null;
      source: string | null;
      previousAssignee: ReturnType<typeof agentRef>;
      selectedAssignee: ReturnType<typeof agentRef>;
      projectOfRecord: string | null;
      businessOwner: string | null;
      technicalOwner: string | null;
      workspaceOfRecord: string | null;
      executionAllowed: string | null;
      reviewGate: string | null;
      rationale: string | null;
      confidence: number | null;
      missingFields: string[];
    }
  | {
      id: string;
      kind: "learning";
      createdAt: Date;
      actorType: string;
      actorId: string;
      agentId: string | null;
      runId: string | null;
      source: string | null;
      status: string | null;
      previousStatus: string | null;
      signals: string[];
      missingFields: string[];
      suggestedInstructionSurfaces: string[];
      lessonProposal: Record<string, unknown> | null;
    }
  | {
      id: string;
      kind: "learning_apply_approved";
      createdAt: Date;
      actorType: string;
      actorId: string;
      agentId: string | null;
      runId: string | null;
      approvalId: string | null;
      learningActivityEventId: string | null;
      suggestedInstructionSurfaces: string[];
      signals: string[];
      nextActionOnApproval: string | null;
      proposedComment: string | null;
      followUpIssue: {
        id: string;
        identifier: string | null;
        title: string | null;
      } | null;
    };

export function buildIssueOrgIntelligenceRecords(events: ActivityLike[]): IssueOrgIntelligenceRecord[] {
  const applyFollowUps = new Map<string, { id: string; identifier: string | null; title: string | null }>();
  for (const event of events) {
    if (event.action !== "issue.org_learning_apply_issue_created") continue;
    const details = asRecord(event.details);
    const approvalId = stringValue(details?.approvalId);
    const learningActivityEventId = stringValue(details?.learningActivityEventId);
    const followUpIssueId = stringValue(details?.followUpIssueId);
    if (!approvalId || !learningActivityEventId || !followUpIssueId) continue;
    applyFollowUps.set(`${approvalId}:${learningActivityEventId}`, {
      id: followUpIssueId,
      identifier: stringValue(details?.followUpIssueIdentifier),
      title: stringValue(details?.followUpIssueTitle),
    });
  }

  return events.flatMap((event): IssueOrgIntelligenceRecord[] => {
    const details = asRecord(event.details);
    if (!details) return [];

    if (event.action === "issue.routing_decision_recorded") {
      return [{
        id: event.id,
        kind: "routing",
        createdAt: event.createdAt,
        actorType: event.actorType,
        actorId: event.actorId,
        agentId: event.agentId ?? null,
        runId: event.runId ?? null,
        source: stringValue(details.source),
        previousAssignee: agentRef(details.previousAssignee),
        selectedAssignee: agentRef(details.selectedAssignee),
        projectOfRecord: stringValue(details.project_of_record),
        businessOwner: stringValue(details.business_owner),
        technicalOwner: stringValue(details.technical_owner),
        workspaceOfRecord: stringValue(details.workspace_of_record),
        executionAllowed: executionAllowedLabel(details.execution_allowed),
        reviewGate: stringValue(details.review_gate),
        rationale: stringValue(details.rationale),
        confidence: numberValue(details.confidence),
        missingFields: stringArray(details.missingFields),
      }];
    }

    if (event.action === "issue.learning_recorded") {
      return [{
        id: event.id,
        kind: "learning",
        createdAt: event.createdAt,
        actorType: event.actorType,
        actorId: event.actorId,
        agentId: event.agentId ?? null,
        runId: event.runId ?? null,
        source: stringValue(details.source),
        status: stringValue(details.status),
        previousStatus: stringValue(details.previousStatus),
        signals: stringArray(details.signals),
        missingFields: stringArray(details.missingFields),
        suggestedInstructionSurfaces: stringArray(details.suggestedInstructionSurfaces),
        lessonProposal: asRecord(details.lessonProposal),
      }];
    }

    if (event.action === "issue.org_learning_apply_approved") {
      return [{
        id: event.id,
        kind: "learning_apply_approved",
        createdAt: event.createdAt,
        actorType: event.actorType,
        actorId: event.actorId,
        agentId: event.agentId ?? null,
        runId: event.runId ?? null,
        approvalId: stringValue(details.approvalId),
        learningActivityEventId: stringValue(details.learningActivityEventId),
        suggestedInstructionSurfaces: stringArray(details.suggestedInstructionSurfaces),
        signals: stringArray(details.signals),
        nextActionOnApproval: stringValue(details.nextActionOnApproval),
        proposedComment: stringValue(details.proposedComment),
        followUpIssue: (() => {
          const approvalId = stringValue(details.approvalId);
          const learningActivityEventId = stringValue(details.learningActivityEventId);
          if (!approvalId || !learningActivityEventId) return null;
          return applyFollowUps.get(`${approvalId}:${learningActivityEventId}`) ?? null;
        })(),
      }];
    }

    return [];
  });
}
