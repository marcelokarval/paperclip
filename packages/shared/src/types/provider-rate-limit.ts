export interface ProviderRateLimitBlock {
  id: string;
  companyId: string;
  provider: string;
  adapterType: string;
  limitKind: string;
  modelFamily: string | null;
  resetsAt: string;
  sourceRunId: string | null;
  sourceIssueId: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  createdAt: string;
  updatedAt: string;
}

