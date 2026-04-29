import {
  buildRepositoryBaselineReviewDecisionMarker,
  buildRepositoryBaselineReviewResponseMarker,
  isRepositoryBaselineReviewResponseComment,
  readRepositoryBaselineReviewDecision,
  type RepositoryBaselineReviewDecision,
} from "./repository-baseline-review-comments.js";

function truncateSummaryText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function readNumericField(record: Record<string, unknown>, key: string) {
  return key in record ? record[key] ?? null : undefined;
}

function readCommentText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mergeHeartbeatRunResultJson(
  resultJson: Record<string, unknown> | null | undefined,
  summary: string | null | undefined,
): Record<string, unknown> | null {
  const normalizedSummary = readCommentText(summary);
  const baseResult =
    resultJson && typeof resultJson === "object" && !Array.isArray(resultJson)
      ? resultJson
      : null;

  if (!baseResult) {
    return normalizedSummary ? { summary: normalizedSummary } : null;
  }

  if (!normalizedSummary) {
    return baseResult;
  }

  if (readCommentText(baseResult.summary)) {
    return baseResult;
  }

  return {
    ...baseResult,
    summary: normalizedSummary,
  };
}

export function summarizeHeartbeatRunResultJson(
  resultJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return null;
  }

  const summary: Record<string, unknown> = {};
  const textFields = ["summary", "result", "message", "error"] as const;
  for (const key of textFields) {
    const value = truncateSummaryText(resultJson[key]);
    if (value !== null) {
      summary[key] = value;
    }
  }

  const numericFieldAliases = ["total_cost_usd", "cost_usd", "costUsd"] as const;
  for (const key of numericFieldAliases) {
    const value = readNumericField(resultJson, key);
    if (value !== undefined && value !== null) {
      summary[key] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}

export function buildHeartbeatRunIssueComment(
  resultJson: Record<string, unknown> | null | undefined,
  options: {
    truthReconciliationFooter?: string | null;
    repositoryBaselineReview?: boolean;
    reviewFingerprint?: string | null;
  } = {},
): string | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return null;
  }

  const baseComment = (
    readCommentText(resultJson.summary)
    ?? readCommentText(resultJson.result)
    ?? readCommentText(resultJson.message)
    ?? null
  );
  if (!baseComment) return null;
  const normalizedBaseComment = options.repositoryBaselineReview
    ? normalizeRepositoryBaselineReviewComment(baseComment)
    : baseComment;
  const reviewDecision = options.repositoryBaselineReview
    ? classifyRepositoryBaselineReviewComment(normalizedBaseComment)
    : null;

  const truthReconciliationFooter = readCommentText(options.truthReconciliationFooter);
  const responseMarker = options.repositoryBaselineReview
    ? buildRepositoryBaselineReviewResponseMarker(options.reviewFingerprint)
    : null;
  const decisionMarker = options.repositoryBaselineReview
    ? buildRepositoryBaselineReviewDecisionMarker(reviewDecision?.decision ?? "unknown")
    : null;
  const parts = [normalizedBaseComment];
  if (truthReconciliationFooter) parts.push(truthReconciliationFooter);
  if (responseMarker) parts.push(responseMarker);
  if (decisionMarker) parts.push(decisionMarker);
  return parts.filter(Boolean).join("\n\n");
}

const SAFE_FOR_FIRST_CTO_PATTERNS = [
  /good enough for (the )?first cto hire/i,
  /strong enough for (a )?first cto hire/i,
  /sufficient for future technical agent work/i,
  /legible enough to onboard a future cto/i,
  /safe enough for (first )?cto onboarding/i,
  /sufficient .*cto onboarding/i,
  /continua forte o bastante para onboarding t[eé]cnico/i,
  /continua forte o bastante/i,
  /baseline .* suficiente .* trabalho futuro de agentes/i,
  /baseline .* suficiente .* trabalho t[eé]cnico futuro/i,
  /baseline .* suficiente .* futuro trabalho t[eé]cnico/i,
  /baseline .* suficiente .* onboarding t[eé]cnico/i,
  /baseline .* bom o bastante .* onboarding/i,
  /suficiente para trabalho futuro de agentes/i,
  /suficiente para trabalho t[eé]cnico futuro/i,
  /suficiente para futuro trabalho t[eé]cnico/i,
  /suficiente para onboarding t[eé]cnico futuro/i,
  /suficiente para onboarding do cto/i,
  /bom o bastante para onboarding/i,
  /seguro para onboarding do cto/i,
];

const BLOCKING_FOR_FIRST_CTO_PATTERNS = [
  /baseline is not (yet )?sufficient for (the )?first cto/i,
  /not safe (yet )?for (the )?first cto/i,
  /insufficient for (the )?first cto/i,
  /ainda n[aã]o .* suficiente .* primeiro cto/i,
  /n[aã]o .* seguro .* onboarding do cto/i,
];

function commentImpliesFirstCtoIsSafe(comment: string) {
  return SAFE_FOR_FIRST_CTO_PATTERNS.some((pattern) => pattern.test(comment));
}

function commentImpliesFirstCtoIsBlocked(comment: string) {
  return BLOCKING_FOR_FIRST_CTO_PATTERNS.some((pattern) => pattern.test(comment));
}

function classifyRepositoryBaselineReviewComment(comment: string): {
  decision: RepositoryBaselineReviewDecision;
} {
  if (commentImpliesFirstCtoIsBlocked(comment)) {
    return { decision: "insufficient_for_first_cto" };
  }
  if (commentImpliesFirstCtoIsSafe(comment)) {
    return { decision: "sufficient_for_first_cto" };
  }
  return { decision: "unknown" };
}

function removeContradictoryFirstCtoPreHireGates(comment: string) {
  return comment
    .replace(
      /,\s*mas\s+ainda\s+n[aã]o\s+est[aá]\s+pronto\s+para\s+delega[cç][aã]o\s+sem\s+[^.]+\.?/gi,
      ".",
    )
    .replace(
      /,\s*mas\s+ainda\s+n[aã]o\s+est[aá]\s+pronto\s+para\s+delega[cç][aã]o\s+sem\s+contexto\s+operacional\s+adicional\.?/gi,
      ".",
    )
    .replace(
      /,\s*mas\s+ainda\s+n[aã]o\s+(?:[eé]\s+)?contexto\s+bom\s+o\s+bastante\s+para\s+delega[cç][aã]o\s+sem\s+[^.]+\.?/gi,
      ".",
    )
    .replace(
      /\bmas\s+ainda\s+n[aã]o\s+est[aá]\s+pronto\s+para\s+delega[cç][aã]o\s+sem\s+[^.]+\.?/gi,
      "",
    )
    .replace(
      /\bmas\s+ainda\s+n[aã]o\s+est[aá]\s+pronto\s+para\s+delega[cç][aã]o\s+sem\s+contexto\s+operacional\s+adicional\.?/gi,
      "",
    )
    .replace(
      /\bmas\s+ainda\s+n[aã]o\s+(?:[eé]\s+)?contexto\s+bom\s+o\s+bastante\s+para\s+delega[cç][aã]o\s+sem\s+[^.]+\.?/gi,
      "",
    )
    .replace(
      /\b(?:but|however)\s+(?:it\s+)?is\s+not\s+(?:yet\s+)?ready\s+for\s+delegation\s+without\s+[^.]+\.?/gi,
      "",
    )
    .replace(
      /\b(?:still\s+)?(?:requires?|needs?)\s+(?:an?\s+)?(?:operator\s+)?(?:freshness\s+note|operational\s+note)\s+before\s+(?:delegation|the\s+first\s+cto\s+hire)[^.]*\.?/gi,
      "",
    )
    .replace(
      /\b(?:ainda\s+)?(?:depende|precisa)\s+de\s+uma?\s+(?:nota\s+operacional|freshness\s+note)\s+(?:expl[ií]cita\s+)?(?:do\s+operador\s+)?antes\s+d[ae]\s+(?:delega[cç][aã]o|contrata[cç][aã]o\s+do\s+cto)[^.]*\.?/gi,
      "",
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rewriteRepositoryBaselineNextAction(comment: string) {
  const sanitizedComment = removeContradictoryFirstCtoPreHireGates(comment);
  const sections = sanitizedComment.split(/\n{2,}/);
  const filtered = sections.filter((section) => {
    const normalized = section.trim();
    if (!normalized) return false;
    if (/\*\*Next Action\*\*/i.test(normalized)) return false;
    if (/(freshness note|nota operacional|execution contract|full runbook)/i.test(normalized)) return false;
    if (/after that, the baseline is safe for cto onboarding/i.test(normalized)) return false;
    if (/depois disso, o baseline fica seguro para onboarding do cto/i.test(normalized)) return false;
    if (/next single operator action is to add/i.test(normalized)) return false;
    if (/pr[oó]xima a[cç][aã]o .* operador .* (adicionar|publicar)/i.test(normalized)) return false;
    if (/n[aã]o est[aá] pronto para delega[cç][aã]o/i.test(normalized)) return false;
    if (/contexto operacional adicional/i.test(normalized)) return false;
    if (/delega[cç][aã]o\s+ainda\s+n[aã]o/i.test(normalized)) return false;
    if (/n[aã]o\s+(?:[eé]\s+)?contexto\s+bom\s+o\s+bastante\s+para\s+delega[cç][aã]o/i.test(normalized)) return false;
    return true;
  });
  filtered.push(
    [
      "**Workflow Decision**",
      "Repository context is sufficient for the first CTO hire.",
      "Open runtime, verification, bootstrap, env, or local-only security questions are CTO onboarding clarifications, not pre-hire blockers.",
    ].join("\n\n"),
  );
  filtered.push(
    [
      "**Next Action**",
      "Accept repository context from Project Intake, then generate the CTO hiring brief.",
      "Open questions about package manager/runtime, bootstrap env vars, verification commands, or local-only security posture can travel as CTO onboarding clarifications.",
    ].join("\n\n"),
  );
  return filtered.join("\n\n");
}

function normalizeRepositoryBaselineReviewComment(comment: string) {
  const classification = classifyRepositoryBaselineReviewComment(comment);
  if (classification.decision !== "sufficient_for_first_cto") return comment;
  if (/generate the cto hiring brief/i.test(comment) || /generate hiring brief/i.test(comment)) return comment;
  return rewriteRepositoryBaselineNextAction(comment);
}

export function normalizeRepositoryBaselineReviewCommentForPersistence(input: {
  body: string;
  reviewFingerprint?: string | null;
}) {
  const normalizedBody = normalizeRepositoryBaselineReviewComment(input.body);
  if (isRepositoryBaselineReviewResponseComment(normalizedBody) && readRepositoryBaselineReviewDecision(normalizedBody)) {
    return normalizedBody;
  }

  const decision = classifyRepositoryBaselineReviewComment(normalizedBody).decision;
  const responseMarker = buildRepositoryBaselineReviewResponseMarker(input.reviewFingerprint ?? null);
  const decisionMarker = buildRepositoryBaselineReviewDecisionMarker(decision);
  return [normalizedBody, responseMarker, decisionMarker].join("\n\n");
}
