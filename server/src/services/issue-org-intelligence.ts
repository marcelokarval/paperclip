type ActivityLike = {
  id: string;
  action: string;
  entityId?: string | null;
  actorType: string;
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
  createdAt: Date;
  details?: Record<string, unknown> | null;
};

type IssueLike = {
  id: string;
  identifier?: string | null;
  title: string;
  status?: string | null;
  originKind?: string | null;
  originId?: string | null;
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

function sourceIssueIdFromApplyOrigin(originId: string | null | undefined): string | null {
  if (!originId) return null;
  const match = originId.match(/^org-learning-apply:([^:]+):[^:]+:[^:]+$/);
  return match?.[1] ?? null;
}

function firstInstructionSurface(value: unknown): string | null {
  return stringArray(value)[0] ?? null;
}

function proposalSummary(details: Record<string, unknown>, sourceIssue: { identifier?: string | null; id: string }) {
  const nextAction = stringValue(details.nextActionOnApproval);
  if (nextAction) return nextAction;
  const issueRef = sourceIssue.identifier ?? sourceIssue.id.slice(0, 8);
  return `Propose the minimal instruction update approved from org-learning on ${issueRef}.`;
}

function proposalText(details: Record<string, unknown>, targetSurfaces: string[]) {
  const proposedComment = stringValue(details.proposedComment);
  const signals = stringArray(details.signals);
  return [
    "Instruction patch proposal only. Do not mutate instruction files until a human approves the patch.",
    "",
    "Target surfaces:",
    ...(targetSurfaces.length > 0 ? targetSurfaces.map((surface) => `- ${surface}`) : ["- No target surface recorded"]),
    "",
    "Signals:",
    ...(signals.length > 0 ? signals.map((signal) => `- ${signal}`) : ["- No signals recorded"]),
    "",
    "Proposed application:",
    proposedComment ?? "Review the approved org-learning record and draft the smallest safe instruction change.",
  ].join("\n");
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
    }
  | {
      id: string;
      kind: "instruction_patch_proposal";
      createdAt: Date;
      actorType: string;
      actorId: string;
      agentId: string | null;
      runId: string | null;
      proposalId: string | null;
      summary: string | null;
      proposalText: string | null;
      targetSurfaces: string[];
      sourceLinks: Record<string, unknown>[];
      requiresHitlBeforeMutation: true;
    };

export interface InstructionPatchProposal {
  proposalId: string;
  sourceLinks: Array<{
    type: "source_issue" | "apply_issue" | "approval" | "learning_activity" | "apply_approval_activity";
    id: string;
    label: string;
    path?: string;
  }>;
  targetSurfaces: string[];
  summary: string;
  proposalText: string;
  requiresHitlBeforeMutation: true;
}

export interface CompanyOrgIntelligenceAggregate {
  counts: {
    routingDecisions: number;
    learningRecords: number;
    learningApprovals: number;
    patchProposals: number;
    openApplyIssues: number;
  };
  recentEvidence: Array<{
    id: string;
    kind: "routing" | "learning" | "learning_approval" | "patch_proposal" | "open_apply_issue";
    issueId: string;
    issueIdentifier: string | null;
    issueTitle: string | null;
    createdAt: Date | string | null;
    summary: string;
  }>;
}

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

    if (event.action === "issue.instruction_patch_proposal_created") {
      return [{
        id: event.id,
        kind: "instruction_patch_proposal",
        createdAt: event.createdAt,
        actorType: event.actorType,
        actorId: event.actorId,
        agentId: event.agentId ?? null,
        runId: event.runId ?? null,
        proposalId: stringValue(details.proposalId),
        summary: stringValue(details.summary),
        proposalText: stringValue(details.proposalText),
        targetSurfaces: stringArray(details.targetSurfaces),
        sourceLinks: Array.isArray(details.sourceLinks)
          ? details.sourceLinks.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
          : [],
        requiresHitlBeforeMutation: true,
      }];
    }

    return [];
  });
}

export function parseOrgLearningApplyOrigin(originId: string | null | undefined): {
  sourceIssueId: string;
  approvalId: string;
  learningActivityEventId: string;
} | null {
  if (!originId) return null;
  const match = originId.match(/^org-learning-apply:([^:]+):([^:]+):([^:]+)$/);
  if (!match) return null;
  return {
    sourceIssueId: match[1],
    approvalId: match[2],
    learningActivityEventId: match[3],
  };
}

export function buildInstructionPatchProposal(input: {
  applyIssue: IssueLike;
  sourceIssue: IssueLike;
  applyApprovedEvent: ActivityLike;
}): InstructionPatchProposal {
  const parsed = parseOrgLearningApplyOrigin(input.applyIssue.originId);
  const details = asRecord(input.applyApprovedEvent.details) ?? {};
  const approvalId = parsed?.approvalId ?? stringValue(details.approvalId) ?? "unknown-approval";
  const learningActivityEventId =
    parsed?.learningActivityEventId ?? stringValue(details.learningActivityEventId) ?? "unknown-learning";
  const targetSurfaces = [
    ...new Set([
      firstInstructionSurface(details.lessonProposal),
      ...stringArray(details.suggestedInstructionSurfaces),
    ].filter((surface): surface is string => Boolean(surface))),
  ];
  const proposalId = [
    "instruction-patch-proposal",
    input.applyIssue.id,
    approvalId,
    learningActivityEventId,
  ].join(":");

  return {
    proposalId,
    sourceLinks: [
      {
        type: "source_issue",
        id: input.sourceIssue.id,
        label: input.sourceIssue.identifier ?? input.sourceIssue.title,
        path: `/issues/${input.sourceIssue.id}`,
      },
      {
        type: "apply_issue",
        id: input.applyIssue.id,
        label: input.applyIssue.identifier ?? input.applyIssue.title,
        path: `/issues/${input.applyIssue.id}`,
      },
      { type: "approval", id: approvalId, label: `Approval ${approvalId}` },
      {
        type: "learning_activity",
        id: learningActivityEventId,
        label: `Learning activity ${learningActivityEventId}`,
      },
      {
        type: "apply_approval_activity",
        id: input.applyApprovedEvent.id,
        label: `Apply approval activity ${input.applyApprovedEvent.id}`,
      },
    ],
    targetSurfaces,
    summary: proposalSummary(details, input.sourceIssue),
    proposalText: proposalText(details, targetSurfaces),
    requiresHitlBeforeMutation: true,
  };
}

export function findInstructionPatchProposal(events: ActivityLike[], proposalId: string): InstructionPatchProposal | null {
  for (const event of events) {
    if (event.action !== "issue.instruction_patch_proposal_created") continue;
    const details = asRecord(event.details);
    if (stringValue(details?.proposalId) !== proposalId) continue;
    return {
      proposalId,
      sourceLinks: (Array.isArray(details?.sourceLinks)
        ? details.sourceLinks
            .map((item) => asRecord(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : []) as InstructionPatchProposal["sourceLinks"],
      targetSurfaces: stringArray(details?.targetSurfaces),
      summary: stringValue(details?.summary) ?? "Instruction patch proposal",
      proposalText: stringValue(details?.proposalText) ?? "",
      requiresHitlBeforeMutation: true,
    };
  }
  return null;
}

export function buildCompanyOrgIntelligenceAggregate(input: {
  activity: ActivityLike[];
  openApplyIssues: IssueLike[];
  recentLimit?: number;
}): CompanyOrgIntelligenceAggregate {
  const counts = {
    routingDecisions: 0,
    learningRecords: 0,
    learningApprovals: 0,
    patchProposals: 0,
    openApplyIssues: input.openApplyIssues.length,
  };
  const evidence: CompanyOrgIntelligenceAggregate["recentEvidence"] = [];

  for (const event of input.activity) {
    const details = asRecord(event.details);
    const issueId = event.action === "issue.instruction_patch_proposal_created"
      ? stringValue(details?.applyIssueId) ?? event.entityId ?? event.id
      : stringValue(details?.sourceIssueId) ?? event.entityId ?? event.id;
    const issueIdentifier = stringValue(details?.sourceIssueIdentifier) ?? stringValue(details?.applyIssueIdentifier);
    const issueTitle = stringValue(details?.sourceIssueTitle) ?? stringValue(details?.applyIssueTitle);

    if (event.action === "issue.routing_decision_recorded") {
      counts.routingDecisions += 1;
      evidence.push({
        id: event.id,
        kind: "routing",
        issueId,
        issueIdentifier,
        issueTitle,
        createdAt: event.createdAt,
        summary: stringValue(details?.rationale) ?? "Routing decision recorded",
      });
    } else if (event.action === "issue.learning_recorded") {
      counts.learningRecords += 1;
      evidence.push({
        id: event.id,
        kind: "learning",
        issueId,
        issueIdentifier,
        issueTitle,
        createdAt: event.createdAt,
        summary: stringValue(asRecord(details?.lessonProposal)?.proposed_change) ?? "Org-learning record captured",
      });
    } else if (event.action === "issue.org_learning_apply_approved") {
      counts.learningApprovals += 1;
      evidence.push({
        id: event.id,
        kind: "learning_approval",
        issueId,
        issueIdentifier,
        issueTitle,
        createdAt: event.createdAt,
        summary: stringValue(details?.nextActionOnApproval) ?? "Org-learning approved for application",
      });
    } else if (event.action === "issue.instruction_patch_proposal_created") {
      counts.patchProposals += 1;
      evidence.push({
        id: event.id,
        kind: "patch_proposal",
        issueId,
        issueIdentifier,
        issueTitle,
        createdAt: event.createdAt,
        summary: stringValue(details?.summary) ?? "Instruction patch proposal created",
      });
    }
  }

  for (const issue of input.openApplyIssues) {
    evidence.push({
      id: issue.id,
      kind: "open_apply_issue",
      issueId: issue.id,
      issueIdentifier: issue.identifier ?? null,
      issueTitle: issue.title,
      createdAt: null,
      summary: `Open org-learning apply issue: ${issue.title}`,
    });
  }

  return {
    counts,
    recentEvidence: evidence
      .sort((a, b) => {
        const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return right - left;
      })
      .slice(0, input.recentLimit ?? 20),
  };
}
