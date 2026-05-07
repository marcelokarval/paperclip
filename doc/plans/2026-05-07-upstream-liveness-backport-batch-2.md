# 2026-05-07 Upstream Liveness Backport Batch 2

## Objective

Continue selective upstream integration without wholesale merging upstream
`master`, preserving local fork behavior and focusing on failures that can
directly affect operator confidence:

- run/session retry loops;
- stale checkout/release locks;
- live-run/run-detail visibility failures;
- plugin migration reliability;
- newly merged upstream remote-workspace hardening when it is locally relevant.

## Entry State

- Branch: `local-pr-d-data-integrity-cascades`
- Previous local pushed commit: `b8ff3ca1`
- Upstream after refresh: `upstream/master` advanced to `12cb7b40`
- Dirty pre-existing local docs to preserve:
  - `doc/GOAL.md`
  - `doc/plans/2026-05-07-fast-agent-operating-context-prd.md`
  - `doc/spec/fast-agent-execution-kernel.md`

## Subagent Concurrency Rule

Run at most two subagents at the same time.

Execution and review must remain separated:

- implementer does not review its own work;
- reviewer must challenge the implementation against the stated ref and local
  behavior;
- orchestrator performs final review and closure.

## Candidate Radar

### First Priority

- `#5438`: clear Claude local session after transient upstream errors.
- `#5439`: allow namespaced `CREATE INDEX` in plugin migration SQL validator.
- `#5442`: stale-lock recovery for checkout/release ownership conflicts.
- `#5423`: `/live-runs` 500 from wrong service receiver/export usage.

### Updated Upstream Inputs

- `#5440`: merged into upstream; sidebar search route polish.
- `#5444`: merged into upstream; remote workspace sync and restore hardening.
- `#5445` / `#5446`: still open stacked runtime stabilization PRs.
- `#5450` / `#5451`: new open runtime/auth/liveness PRs to triage before
  selecting the next local slice.
- `#5452` / `#5453` / `#5454`: new issues that may overlap sticky checkout,
  liveness symmetry, and API-key comment failures.

## Execution Plan

1. Run updated upstream triage and local gap analysis in parallel.
2. Select only refs that are locally missing, bounded, and testable.
3. Delegate implementation to workers with disjoint file ownership.
4. Delegate reviews to separate agents after each implementation slice.
5. Run final local QA:
   - focused tests for changed areas;
   - `pnpm -r typecheck`;
   - `COREPACK_HOME=/tmp/paperclip-corepack pnpm test`;
   - `pnpm build`.
6. Run browser-proof when UI/operator flows are touched.
7. Update backport tracking docs if a ref is integrated.
8. Commit and push only after final review passes.

## Non-Goals

- Do not merge upstream wholesale.
- Do not touch the fast-agent PRD/spec changes unless explicitly required by
  this batch.
- Do not implement SSH/remote runtime prerequisites unless a selected upstream
  ref has a bounded local callsite and tests.
- Do not open an upstream PR automatically.

## Proof Targets

- Each integrated ref has a local test proving the behavior.
- Final output states which upstream refs were integrated, deferred, or found
  already present.
- Browser-proof includes console and network checks if any UI route changes.
