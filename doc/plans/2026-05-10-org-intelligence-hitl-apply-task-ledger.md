# Org Intelligence HITL Apply Task Ledger

Date: 2026-05-10
Plan: `doc/plans/2026-05-10-org-intelligence-hitl-apply-execution-plan.md`

## Status Legend

- `pending`: not started
- `in_progress`: active
- `blocked`: cannot continue without a specific dependency
- `review`: implementation done, under review
- `completed`: accepted by orchestrator review

## Tasks

### OIH-01: Visual Review

Status: `completed`

Owner: Orchestrator

Deliverables:

- Browser-proof current Org Intelligence page.
- Confirm whether current copy makes the non-mutating state explicit.
- Capture console/network state.
- Record artifacts in `.tmp/`.

### OIH-02: Backend HITL Approval And Apply

Status: `completed`

Owner: Worker

Deliverables:

- Add board-only endpoint to request an instruction patch approval from an
  existing instruction patch proposal.
- Add board-only endpoint to apply an approved instruction patch approval.
- Require issue/proposal/approval/company linkage.
- Require a concrete `targetAgentId`, `targetSurface`, and `patchText`.
- Refuse pending/rejected/non-matching approvals.
- Apply idempotently using an approval-id marker block.
- Use the existing agent instruction service and record issue/agent activity.

Result:

- Added board-only instruction patch approval and approved apply endpoints.
- Apply is limited to `org_learning_apply` issues, verifies proposal/activity,
  linked approval, company-scoped target agent, approved status, and idempotent
  prior-apply activity.
- Approved apply appends an approval-id marker block through the agent
  instruction service, records an adapter config revision, and logs issue plus
  agent activity.
- Orchestrator correction: approved apply now creates the selected instruction
  surface when the file does not exist yet, instead of failing with
  `Instructions file not found`.

### OIH-03: UI HITL Flow

Status: `completed`

Owner: Worker

Deliverables:

- Show the proposal-to-approval-to-apply sequence in the issue Org Intel tab.
- Provide target agent, target surface, and patch text controls.
- Make it explicit that approval is required before mutation.
- Surface pending/approved/applied states from issue approvals/activity.
- Keep the copy short enough for operators to understand the next action.

Result:

- Fixed the company-prefix route bug by adding `org-intelligence` to
  `BOARD_ROUTE_ROOTS`.
- Org Intel proposal cards now expose target agent, instruction surface, patch
  textarea, `Request HITL patch approval`, linked approval state, approved apply
  action, and applied state.

### OIH-04: Tests And Browser Fixtures

Status: `completed`

Owner: Worker

Deliverables:

- Extend server tests for the new approval/apply endpoints.
- Update browser-proof fixture(s) for the new controls.
- Keep fixtures deterministic and avoid broad ambiguous text matching.

Result:

- Extended focused issue route tests for approval creation, pending apply
  refusal, approved apply success, missing surface creation, and idempotent
  re-apply.
- Updated deterministic browser-proof fixture/docs for company-prefixed Org
  Intelligence route and HITL apply controls.

### OIH-05: Orchestrator Final Review

Status: `completed`

Owner: Orchestrator

Deliverables:

- Review worker implementation task by task.
- Run focused tests/typechecks/build.
- Execute browser-proof with console/network inspection.
- Update plan and ledger with results.
- Commit and push if passing.

## Review Notes

- OIH-01 browser-proof artifact:
  `.tmp/browser-proof-2026-05-10T22-12-57-399Z.json`.
- Console/network were clean, but screenshot
  `.tmp/browser-proof-2026-05-10T22-12-57-399Z.png` exposed a functional route
  bug: clicking the sidebar `Org Intelligence` item navigated to
  `/org-intelligence` without the active company prefix and rendered
  `Company not found` for prefix `ORG-INTELLIGENCE`.
- Root cause sent to worker: `org-intelligence` was missing from
  `BOARD_ROUTE_ROOTS` in `ui/src/lib/company-routes.ts`.
- Worker `Galileo` was closed as non-responsive after direct pings and no
  detectable file progress. Worker `Zeno` replaced it, delivered OIH-02 through
  OIH-04, and was closed after return.
- Orchestrator browser-proof of approved apply initially failed because the
  selected surface did not exist on the target agent. The endpoint was corrected
  to create missing instruction surfaces with the approval marker block.

## Verification Results

- OIH-01 visual proof completed with the route bug above promoted into OIH-03.
- OIH-02/OIH-03/OIH-04 worker proof:
  - Worker-reported focused tests/typechecks passed before orchestrator review.
- Orchestrator proof:
  - `pnpm test:run server/src/__tests__/issue-activity-events-routes.test.ts`
    passed: 20 tests after missing-surface correction.
  - `pnpm --filter @paperclipai/server typecheck` passed.
  - `pnpm --filter @paperclipai/ui typecheck` passed.
  - `pnpm --filter @paperclipai/shared typecheck` passed.
  - `pnpm --filter @paperclipai/ui exec vitest run src/lib/company-routes.test.ts`
    passed: 6 tests.
  - `git diff --check` passed.
  - `pnpm build` passed. Vite emitted the known large chunk warning.
  - Browser-proof passed for `/ROF/org-intelligence`:
    `.tmp/browser-proof-2026-05-10T22-27-46-148Z.json`.
  - Browser-proof passed for `/ROF/issues/ROF-48` proposal/HITL controls:
    `.tmp/browser-proof-2026-05-10T22-28-28-875Z.json`.
  - Browser-proof clicked `Request HITL patch approval` successfully:
    `.tmp/browser-proof-2026-05-10T22-31-03-918Z.json`.
  - Approved apply was first validated through local API after approval, then
    browser-proof confirmed the UI `Patch applied` state:
    `.tmp/browser-proof-2026-05-10T22-40-07-870Z.json`.
  - All passing browser proofs had clean console warning/error filters and empty
    `networkProblems`.
