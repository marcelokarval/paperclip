# Org Learning And Routing Execution Plan

Date: 2026-05-07
Branch: local-pr-d-data-integrity-cascades

## Objective

Turn issue routing, agent-to-agent communication, and post-issue learning from
comment-only guidance into structured, reviewable, and reusable operating
context.

## Prompt B

Implement a first complete, verifiable organizational intelligence layer:

- structured routing decision records for issue creation and reassignment
- post-issue learning extraction records for terminal/problematic issue states
- default agent birth-kit files for communication, routing, and lessons
- API/UI surfaces that expose routing and learning evidence on issue pages
- tests and documentation that prove the workflow is not only prompt text

## Non-Goals

- Do not silently mutate agent instructions without HITL.
- Do not make agents autonomously create broad implementation trees.
- Do not replace the current heartbeat runtime.
- Do not require a new external service.
- Do not make CEO do IC implementation work.

## Architecture

### Routing Decision Record

Every issue creation or assignee change should emit a structured routing record.
The record must capture:

- issue id and company id
- source issue id when available
- actor
- previous and selected assignee
- candidate/rejected assignee context when available
- project of record
- business owner
- technical owner
- workspace of record
- execution allowed
- review gate
- rationale
- confidence
- missing fields

### Post-Issue Learning Record

Terminal or problematic issue states should emit an org-learning record. The
first version should be deterministic and conservative:

- done
- blocked
- cancelled
- failed/recovery-loop indicators when available
- missing labels
- missing assignee
- missing routing fields
- repeated run/retry evidence
- suggested instruction surfaces to review
- HITL-required instruction improvement proposal text

### Agent Birth Kit

All new agents should receive communication/learning context, not only generic
AGENTS.md:

- COMMUNICATION_PROTOCOL.md
- ROUTING_TABLE.md
- LESSONS_LEDGER.md

CEO should keep richer executive files, but every agent needs enough shared
context to request routing, review, reassignment, and instruction improvement.

### UI/API Proof Surface

Issue detail must make routing and learning visible without forcing the operator
to infer it from long comments. The first surface can be a side panel/activity
section backed by structured activity details or a dedicated endpoint.

## Task Ledger

| ID | Owner | Status | Scope | Review Owner |
| --- | --- | --- | --- | --- |
| ORG-01 | Orchestrator after Worker A timeout | completed | Backend routing decision emission and tests | Reviewer A |
| ORG-02 | Orchestrator | completed | Post-issue learning extraction and tests | Reviewer A |
| ORG-03 | Orchestrator after Worker C partial output/timeout | completed | Agent birth-kit defaults and tests | Reviewer B |
| ORG-04 | Orchestrator | completed | UI/API issue visibility for routing/learning | Reviewer B |
| ORG-05 | Orchestrator | completed | Integrated verification, browser-proof, final forensic review | Orchestrator |

## Acceptance Criteria

- Creating an assigned issue records a structured routing decision.
- Reassigning an issue records a structured routing decision.
- Completing/blocking/cancelling an issue records a learning record when there
  is meaningful routing/metadata context to learn from.
- Learning records are proposals/evidence only; instruction mutation remains
  HITL.
- New non-CEO agents receive communication/routing/lessons birth-kit files.
- CEO bundle keeps self-improvement and communication guidance aligned.
- Issue UI or API exposes the structured records clearly.
- Tests cover backend behavior and birth-kit generation.
- Browser-proof confirms the issue page shows the new evidence with console and
  network checked.

## Runtime Notes

- The orchestrator owns final integration and review.
- Workers must self-review and self-forensic-review their slice.
- Reviewers must be different from implementers.
- Idle or stuck agents should be closed and replaced.

## Review Findings Resolved

- Worker A and Worker C were closed after running without final delivery.
- Reviewer A found request-vs-persisted-null routing trigger drift; fixed by
  basing create-time routing decisions on request intent.
- Reviewer A found adapter override-only routing changes were unaudited; fixed
  by recording routing decisions when assignee adapter overrides change.
- Reviewer A found create-time learning was not wired; fixed for direct
  blocked/cancelled/done issue creation.
- Reviewer A found noisy learning missing-field detection; reduced with
  project/workspace/execution/review context where available.
- Reviewer B found CEO instruction text that could bypass HITL; narrowed to
  inspect/propose unless board/task authorized.
- Reviewer B found routing UI labels too vague; fixed to resolve agent/user
  labels where possible.
- Reviewer B found role casing drift; fixed CEO/CTO role normalization in
  default bundle/project packet generation.

## Verification Notes

- `pnpm --filter @paperclipai/server test -- issue-activity-events-routes.test.ts issue-assigned-backlog-contract-routes.test.ts default-agent-instructions.test.ts`
  passed.
- `pnpm --filter @paperclipai/ui test -- activity-format.test.ts` passed.
- `pnpm --filter @paperclipai/server typecheck` passed.
- `pnpm --filter @paperclipai/ui typecheck` passed.
- `git diff --check` passed.
- Browser proof used ROF-45 as a cancelled audit issue. The issue activity page
  showed `recorded routing decision to CTO` and `recorded org-learning for
  blocked from missing labels, missing project, blocked status`.
- Browser proof checked console and network. The new routing/learning issue
  activity calls returned 200. Two pre-existing runtime noises were observed:
  a stale `/api/assets/.../content` 404 and a transient heartbeat-run log 404
  that later returned 200.

## Residuals

- Add a broader org-intelligence dashboard for cross-issue routing and learning
  trends.
- Add a full apply flow after HITL approval to patch selected agent instruction
  files with accepted lessons.
- Investigate stale asset references that produce `/api/assets/.../content`
  404s in browser proof.
- Consider a proof/sandbox mode for browser-proof issues so test issues do not
  wake operational agents.

## Follow-Up Slice Completed

- Added `GET /issues/:id/org-intelligence` as a sanitized projection over
  routing and learning activity records.
- Added an `Org Intel` issue tab that shows routing decisions and learning
  proposals as cards rather than another timeline.
- Added `POST /issues/:id/org-learning-approval` so the operator can turn a
  recorded learning proposal into a linked HITL approval.
- Browser proof confirmed the tab renders routing to CTO, execution `no`, the
  learning proposals, and successful HITL approval creation.
- Browser proof still shows a pre-existing stale asset 404:
  `/api/assets/eb4fb907-3956-48fb-9bb0-b39cd57fc150/content`.

## Follow-Up Phase C: Durable HITL Apply And Proof Hardening

### Executive Plan

This phase closes the gap between "learning proposal was approved" and "the
organization actually improved." It also hardens browser-proof so proof work
does not wake operational agents or silently proceed against a dead server.

The intended operating model is:

1. A learning event is recorded from an issue.
2. The operator creates a linked HITL approval from the `Org Intel` tab.
3. Approval remains decision-only until approved by the board.
4. When approved, the system records an explicit apply-needed/applied state
   instead of mutating instructions silently.
5. The operator or responsible agent can see what instruction surfaces must be
   updated and why.
6. Browser-proof runs verify server health, console, network, and issue UI
   without waking operational agents unexpectedly.

### Tasks

| ID | Owner | Status | Scope | Review Owner |
| --- | --- | --- | --- | --- |
| ORG-06 | Worker Apply + Worker Corrective | completed | Add approval-side org-learning apply signal and tests/UI visibility | Reviewer Apply + Orchestrator |
| ORG-07 | Worker Asset + Worker Corrective + Orchestrator | completed | Eliminate stale asset 404 noise or downgrade it to safe fallback | Reviewer Asset + Orchestrator |
| ORG-08 | Worker Proof | completed | Add proof/sandbox guard so browser-proof issues do not wake agents | Orchestrator |
| ORG-09 | Orchestrator | completed | Server-health/browser-proof loop, final review, next-step report | Orchestrator |

### Acceptance Criteria

- Approving an `org_learning_proposal` approval produces a durable, auditable
  signal that instruction updates are approved and need application.
- The approval path does not silently edit agent instruction files.
- The issue view can expose learning proposal approval state without relying on
  long comments.
- Stale avatar/asset references no longer generate console-visible 404 noise
  during browser-proof, or the source is explicitly cleaned/fallbacked.
- Browser-proof starts with server health checks and fails fast if `3101` is not
  serving API responses correctly.
- Proof issues can be created or marked in a way that avoids waking operational
  agents unless the test explicitly intends to verify wakeup.
- Console and network are checked after the proof flow.

### Completion Notes

- ORG-06 now records `issue.org_learning_apply_approved` when an
  `org_learning_proposal` approval is actually applied. The issue `Org Intel`
  tab renders these records under `Learning approvals`.
- ORG-07 now clears stale operator profile asset URLs when the DB row is
  missing or the backing storage object is missing. The UI also stops falling
  back to `session.user.image` after the operator profile has explicitly
  resolved to `image: null`.
- ORG-08 added create-only `suppressAssignmentWakeup` support for board-created
  proof issues, rejects the flag from agent-created issues, strips it before
  persistence, and records the skip reason in `issue.created`.
- ORG-09 browser-proof first found a real stale avatar 404, the orchestrator
  corrected the UI fallback, then reran browser-proof successfully.

### Phase C Verification

- `pnpm exec vitest run packages/shared/src/validators/issue.test.ts server/src/__tests__/issue-assigned-backlog-contract-routes.test.ts server/src/__tests__/approval-routes-idempotency.test.ts server/src/__tests__/operator-profile-routes.test.ts server/src/__tests__/issue-activity-events-routes.test.ts server/src/__tests__/default-agent-instructions.test.ts ui/src/lib/activity-format.test.ts`
  passed: 7 files, 53 tests.
- `pnpm exec vitest run server/src/__tests__/issue-activity-events-routes.test.ts server/src/__tests__/operator-profile-routes.test.ts ui/src/lib/activity-format.test.ts`
  passed after the final stale-avatar correction: 3 files, 23 tests.
- `pnpm --filter @paperclipai/server typecheck` passed.
- `pnpm --filter @paperclipai/ui typecheck` passed.
- `git diff --check` passed.
- Health gate: `http://127.0.0.1:3101/api/health` sustained a 60s clean
  window after earlier intermittent failures.
- Browser-proof fallback: Chrome DevTools MCP transport closed, so the proof
  ran through Playwright with system `google-chrome`, recording console,
  network, screenshot, and proof JSON in `.tmp/`.
- Final browser-proof passed on ROF-45: `Org Intel` showed routing, learning
  proposals, and `Learning approvals`; console had no errors; network had no
  404/500 failures.

### Phase C Residuals

- Chrome DevTools MCP transport closed during this run, so persistent DevTools
  availability should be investigated separately from product behavior.
- The 3101 server had earlier intermittent health flaps before stabilizing; keep
  server health as a required proof gate for future browser-proof runs.

## Follow-Up Phase D: Controlled Learning Apply And Proof Tooling

### Executive Plan

Phase C made approved org-learning visible, but it intentionally stopped before
mutating agent instruction files. Phase D closes that operating gap without
making the system silently self-edit.

The intended flow is:

1. An issue records an org-learning proposal.
2. The operator creates a HITL approval from `Org Intel`.
3. The operator approves the learning proposal.
4. The issue shows the approved apply signal and an explicit apply action.
5. The apply action creates a concrete follow-up issue assigned to the selected
   responsible agent, carrying the approved surfaces, proposed comment, and
   source approval IDs.
6. No instruction file is edited by this action. The follow-up issue is the
   governed work item where an agent can inspect and propose/apply file changes.
7. Browser-proof must run only after a health gate and must capture console and
   network evidence in `.tmp/`.

This keeps HITL as the decision gate and turns "approved learning" into tracked
work rather than invisible policy mutation.

### Tasks

| ID | Owner | Status | Scope | Review Owner |
| --- | --- | --- | --- | --- |
| ORG-10 | Worker Apply Follow-Up + Worker Corrective | completed | Create explicit apply-follow-up action for approved org-learning records | Reviewer Proof + Orchestrator |
| ORG-11 | Worker Proof Tooling + Worker Corrective | completed | Add reusable health-gated browser-proof script/spec and docs | Reviewer Proof + Orchestrator |
| ORG-12 | Orchestrator | completed | Integrated QA, browser-proof loop, final forensic review, next-step report | Orchestrator |

### Acceptance Criteria

- Approved org-learning records expose a clear action to create tracked apply
  work.
- The apply action is idempotent for the same issue/approval/learning event.
- The apply action creates a normal issue with source links/context, not a
  silent instruction mutation.
- The created apply issue can use `suppressAssignmentWakeup` for proof flows,
  but production use should wake the assignee normally unless explicitly
  suppressed by the board.
- The UI communicates that "approval" and "application work" are different
  stages.
- Browser-proof tooling first verifies `3101` health stability, then records
  console/network evidence and screenshot/JSON artifacts under `.tmp/`.
- Runtime/browser proof tooling must not require a vendored Playwright browser
  when `/usr/bin/google-chrome` is available.

### Task Details

- ORG-10 backend:
  - add an endpoint that accepts a `learning_apply_approved` activity event and
    creates or returns an existing follow-up issue.
  - source the follow-up title/body from the approved record and linked issue.
  - log an activity event that links source issue, approval, learning event, and
    follow-up issue.
  - cover idempotency and board-only access in tests.
- ORG-10 frontend:
  - add an `Open/Create apply issue` action in `Learning approvals`.
  - invalidate issue/org-intelligence/approval queries after creation.
  - show the existing follow-up issue if the action was already created.
- ORG-11 proof tooling:
  - add a small reusable browser-proof test or script that uses system Chrome.
  - record console errors and 4xx/5xx network failures.
  - preserve health-check output and proof artifacts in `.tmp/`.
- ORG-12 orchestration:
  - run focused backend/UI tests.
  - run typechecks and `git diff --check`.
  - run health-gated browser-proof.
  - perform final review against ORG-10/11 acceptance criteria.

### Phase D ORG-10/11 Completion Notes

- ORG-10 adds board-only `POST /issues/:id/org-learning-apply-issue` for
  `issue.org_learning_apply_approved` records. It creates or returns an
  idempotent `org_learning_apply` follow-up issue keyed by source issue,
  approval, and learning activity event; the issue carries the approved
  surfaces, signals, proposed comment, and next action without mutating
  instruction files.
- The `Org Intel` learning approvals card now distinguishes approval from
  application work and shows `Create apply issue` or `Open apply issue` when a
  follow-up already exists.
- ORG-11 adds `pnpm proof:browser:local`, backed by
  `tests/e2e/health-gated-browser-proof.mjs`, which health-gates
  `http://127.0.0.1:3101/api/health`, uses `/usr/bin/google-chrome` when
  available, and writes console/network/screenshot/JSON proof under `.tmp/`.

### Phase D Review And Correction Notes

- Reviewer Proof found that UI-created apply issues could not pass
  `suppressAssignmentWakeup`, that idempotency was only check-then-create, that
  the proof health gate failed on the first transient failure, and that UI
  invalidation was too narrow.
- Worker Corrective added optional API suppression support, a narrow partial
  unique index for `org_learning_apply` origin keys, duplicate-insert recovery,
  retrying health-gate logic requiring three consecutive successes, and broader
  issue/sidebar/project invalidation.
- Browser click proof then exposed an additional runtime gap: even with
  `suppressAssignmentWakeup`, an assigned `todo` apply issue could be picked up
  by periodic reconciliation. The orchestrator corrected proof-mode apply
  issues to use `backlog` when suppression is requested. Production UI does not
  pass this flag, so normal apply work still wakes the assignee.

### Phase D Verification

- `pnpm exec vitest run packages/shared/src/validators/issue.test.ts server/src/__tests__/issue-assigned-backlog-contract-routes.test.ts server/src/__tests__/approval-routes-idempotency.test.ts server/src/__tests__/operator-profile-routes.test.ts server/src/__tests__/issue-activity-events-routes.test.ts server/src/__tests__/default-agent-instructions.test.ts ui/src/lib/activity-format.test.ts`
  passed: 7 files, 57 tests.
- `pnpm exec vitest run server/src/__tests__/issue-activity-events-routes.test.ts`
  passed after the proof-mode backlog correction: 11 tests.
- `pnpm --filter @paperclipai/server typecheck` passed.
- `pnpm --filter @paperclipai/ui typecheck` passed.
- `pnpm --filter @paperclipai/db typecheck` passed, including migration
  numbering.
- `node --check tests/e2e/health-gated-browser-proof.mjs` passed.
- `git diff --check` passed.
- `PAPERCLIP_BROWSER_PROOF_PATH=/ROF/issues/ROF-45 PAPERCLIP_BROWSER_PROOF_SUPPRESS_ASSIGNMENT_WAKEUP=true pnpm proof:browser:local`
  passed with three consecutive health successes, no console errors, and no
  network problems.
- Additional click proof created `ROF-46` from the `Create apply issue` button
  with request suppression injected by browser proof. That run exposed the
  reconciliation wakeup gap; `ROF-46` was cancelled after the code correction.

### Phase D Residuals

- `ROF-46` remains as a cancelled proof artifact showing the apply issue content
  and origin key.
- The reusable browser-proof runner validates page health/console/network.

## Follow-Up Phase E: Promoted Browser-Proof Action Runner

### Executive Plan

Phase D proved the apply button with a temporary `.tmp/` click script. Phase E
promotes that capability into the tracked browser-proof runner so future
workflow changes can be verified with the same health, console, network, and
screenshot contract without one-off proof scripts.

The intended operating model is:

1. Tests prepare any API state needed for a realistic issue workflow.
2. `pnpm proof:browser:local` opens the target URL after health gating.
3. Optional JSON steps drive UI actions such as tab clicks, button clicks, text
   waits, and screenshots.
4. The runner records each step result in `.tmp/` alongside console/network
   evidence.
5. Any failed step, console warning/error, or 4xx/5xx network response fails the
   proof.

### Tasks

| ID | Owner | Status | Scope | Review Owner |
| --- | --- | --- | --- | --- |
| ORG-13 | Orchestrator | completed | Promote click-flow support into the reusable browser-proof runner | Orchestrator |
| ORG-14 | Orchestrator | completed | Run clean-state apply-flow proof with JSON steps and console/network capture | Orchestrator |
| ORG-15 | Orchestrator | completed | Final verification, commit, push, and clean worktree confirmation | Orchestrator |

### Acceptance Criteria

- The tracked runner supports declarative UI steps via
  `PAPERCLIP_BROWSER_PROOF_STEPS`.
- Step failures are persisted in the proof JSON before the runner exits.
- The existing health gate, console capture, network capture, and screenshot
  behavior remain intact.
- A realistic org-learning apply flow is browser-proved without relying on a
  temporary hand-written Playwright script.

### Phase E Verification

- `node --check tests/e2e/health-gated-browser-proof.mjs` passed.
- API setup created `ROF-47` as a blocked proof issue with
  `suppressAssignmentWakeup`, recorded org-learning, created a HITL approval,
  and approved it.
- `PAPERCLIP_BROWSER_PROOF_PATH=/ROF/issues/ROF-47
  PAPERCLIP_BROWSER_PROOF_SUPPRESS_ASSIGNMENT_WAKEUP=true
  PAPERCLIP_BROWSER_PROOF_STEPS=.tmp/org-learning-apply-proof-steps.json
  pnpm proof:browser:local` passed.
- The browser-proof runner executed 5 tracked steps: open `Org Intel`, wait for
  `Learning approvals`, click `Create apply issue`, wait for `Open apply
  issue`, and take a step screenshot.
- Proof artifacts:
  `.tmp/browser-proof-2026-05-10T20-15-22-972Z.json`,
  `.tmp/browser-proof-2026-05-10T20-15-22-972Z.health.json`, and screenshot
  PNGs. The proof JSON recorded no console warnings/errors, no network
  problems, and no proof failure.
- The click created `ROF-48` as the apply issue from `ROF-47`. It remained
  `backlog`, had origin kind `org_learning_apply`, and
  `/api/issues/ROF-48/live-runs` returned `[]`.
- Focused regression suite passed: 7 files, 57 tests.
- `pnpm --filter @paperclipai/server typecheck` passed.
- `pnpm --filter @paperclipai/ui typecheck` passed.
- `pnpm --filter @paperclipai/db typecheck` passed.
- `git diff --check` passed.
- `pnpm build` passed. Vite emitted the existing large chunk warning for the UI
  production bundle, but the build completed successfully.
