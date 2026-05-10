# Org Intelligence Apply Flow Task Ledger

Date: 2026-05-10
Plan: `doc/plans/2026-05-10-org-intelligence-apply-flow-execution-plan.md`

## Status Legend

- `pending`: not started
- `in_progress`: active
- `blocked`: cannot continue without a specific dependency
- `review`: implementation done, under review
- `completed`: accepted by orchestrator review

## Tasks

### OIA-01: Backend Apply-Patch Proposal

Status: `completed`

Owner: Worker

Deliverables:

- Add board-only endpoint for org-learning apply issues to create or return a
  structured instruction patch proposal.
- Persist proposal as issue activity so no schema migration is required unless
  a strong reason emerges.
- Require source issue, source learning event, source approval, and
  `org_learning_apply` origin context.
- Include `requiresHitlBeforeMutation: true`.
- Cover success, idempotency, invalid issue, non-apply issue, and agent denial.

### OIA-02: Company Org Intelligence Aggregate

Status: `completed`

Owner: Worker

Deliverables:

- Add company-scoped aggregate endpoint summarizing routing decisions, learning
  records, learning approvals, patch proposals, and open apply issues.
- Include recent evidence records with issue identifiers/titles.
- Enforce company access.
- Cover endpoint behavior in backend tests.

### OIA-03: UI Org Intelligence And Apply Proposal

Status: `completed`

Owner: Worker

Deliverables:

- Add an Org Intelligence company page reachable by normal navigation.
- Show aggregate counts and recent evidence without exposing raw JSON.
- On issue pages, show patch proposals and provide a clear action to generate a
  proposal from an apply issue.
- Keep copy explicit: proposal does not mutate instruction files.

### OIA-04: Agent Birth-Kit Hardening

Status: `completed`

Owner: Worker

Deliverables:

- Update default/CEO birth-kit markdown with routing, HITL, reassignment, and
  instruction-improvement protocol.
- Preserve CEO as contractor/refiner and CTO as technical orchestrator.
- Keep all instruction updates proposal/HITL-oriented.

### OIA-05: Browser-Proof Regression Fixtures

Status: `completed`

Owner: Worker

Deliverables:

- Add tracked browser-proof step fixture(s) outside `.tmp/`.
- Document how to run apply-flow and Org Intelligence browser proofs.
- Do not require a vendored Playwright browser when system Chrome exists.

### OIA-06: Orchestrator Final Review

Status: `completed`

Owner: Orchestrator

Deliverables:

- Review worker changes task by task.
- Run focused tests/typechecks/build.
- Execute browser-proof with console/network inspection.
- Update this ledger statuses.
- Report completed work, residuals, and next steps.

## Review Notes

- OIA-01 and OIA-02 were implemented by worker `Singer` and reviewed by the
  orchestrator. `Singer` was closed after final delivery.
- OIA-03 through OIA-05 were partially materialized by worker `Socrates` before
  becoming non-responsive. The orchestrator reviewed, corrected TypeScript
  errors, corrected browser-proof fixtures, and completed proof.
- Corrections made by orchestrator:
  - Added `org_learning_apply` to shared `ISSUE_ORIGIN_KINDS`.
  - Fixed `OrgIntelligence` empty-state props to match the existing component.
  - Replaced ambiguous browser-proof text matching with role/selector-specific
    steps.

## Verification Results

- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/issue-activity-events-routes.test.ts`
  passed: 15 tests.
- `pnpm --filter @paperclipai/shared typecheck` passed.
- `pnpm --filter @paperclipai/server typecheck` passed.
- `pnpm --filter @paperclipai/ui typecheck` passed after orchestrator
  corrections.
- `git diff --check` passed.
- Browser-proof passed for `/ROF/org-intelligence` using
  `tests/e2e/fixtures/org-intelligence-page.steps.json`; console/network were
  clean.
- Browser-proof passed for `/ROF/issues/ROF-48` using
  `tests/e2e/fixtures/org-learning-apply-proposal.steps.json`; console/network
  were clean and the proof generated a persisted instruction patch proposal.
- `curl /api/issues/ROF-48/org-intelligence` confirmed the proposal has
  `requiresHitlBeforeMutation: true`.
- `pnpm build` passed. Vite emitted the pre-existing large chunk warning, but
  the build completed successfully.
