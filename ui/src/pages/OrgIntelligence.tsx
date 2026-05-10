import { useEffect } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit } from "lucide-react";
import { companiesApi, type CompanyOrgIntelligenceAggregate } from "../api/companies";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime } from "../lib/utils";

function countCards(data: CompanyOrgIntelligenceAggregate) {
  return [
    { label: "Routing decisions", value: data.counts.routingDecisions },
    { label: "Learning records", value: data.counts.learningRecords },
    { label: "Learning approvals", value: data.counts.learningApprovals },
    { label: "Patch proposals", value: data.counts.patchProposals },
    { label: "Open apply issues", value: data.counts.openApplyIssues },
  ];
}

function evidenceLabel(kind: CompanyOrgIntelligenceAggregate["recentEvidence"][number]["kind"]) {
  return kind.replace(/_/g, " ");
}

function issueHref(issueId: string) {
  return `/issues/${issueId}`;
}

export function OrgIntelligence() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Intelligence" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.companies.orgIntelligence(selectedCompanyId)
      : ["companies", "missing", "org-intelligence"],
    queryFn: () => companiesApi.orgIntelligence(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={BrainCircuit} message="Select a company to view org intelligence." />;
  }

  if (isLoading && !data) return <PageSkeleton />;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Unable to load org intelligence."}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Org Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Company-level routing, learning, approval, and instruction patch proposal evidence. Patch proposals are
          review artifacts only; they do not mutate instruction files.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {countCards(data).map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-2xl font-semibold">{card.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{card.label}</div>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Recent evidence</h2>
          <p className="text-sm text-muted-foreground">
            Use source issue links for review context before approving any durable instruction update.
          </p>
        </div>

        {data.recentEvidence.length === 0 ? (
          <EmptyState icon={BrainCircuit} message="Routing decisions and org-learning records will appear here." />
        ) : (
          <div className="space-y-2">
            {data.recentEvidence.map((item) => (
              <Link
                key={item.id}
                to={issueHref(item.issueId)}
                className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      {item.issueIdentifier ?? item.issueId.slice(0, 8)}
                      {item.issueTitle ? `: ${item.issueTitle}` : ""}
                    </div>
                    <div className="mt-1 text-xs capitalize text-muted-foreground">{evidenceLabel(item.kind)}</div>
                  </div>
                  {item.createdAt ? (
                    <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
