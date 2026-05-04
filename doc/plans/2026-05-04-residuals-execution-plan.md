# Residuals Execution Plan

Date: 2026-05-04

## Objective

Close the known residuals from the issue-thread interaction and backup pass
without merging upstream wholesale.

Residuals in scope:

- Port the locally useful parts of upstream `#4244` beyond the minimum
  `ask_user_questions` cancellation foundation.
- Add operator response flows for issue-thread interactions where the local
  contract supports them.
- Fix or explicitly harden issue deletion/cleanup after browser-proof exposed a
  `DELETE /api/issues/:id` 500 on temporary proof issues.
- Reassess backup/restore guarantees after cursor batching and either add
  stronger safety or document exact remaining limits without overclaiming
  `pg_dump` parity.

## Operating Rules

- Root assistant is orchestrator and final reviewer, not primary executor.
- Every implementation slice is owned by a worker.
- Every worker output must be reviewed by a different reviewer or the root.
- Browser-proof is mandatory for any UI-visible flow and must inspect console
  and network.
- Full closure requires focused tests, typechecks, browser-proof, full tests,
  build, `git diff --check`, commit, and push.
- Idle agents must be closed once their result has been consumed.

## Slice A: Structured Interaction Backend Lifecycle

Status: completed

Owner: worker A

Write scope:

- `packages/shared/src/constants.ts`
- `packages/shared/src/types/issue.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/validators/issue.ts`
- `packages/shared/src/validators/index.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/issue-thread-interactions.test.ts`
- `server/src/services/issue-thread-interactions.ts`
- `server/src/services/issue-thread-interactions.test.ts`
- `server/src/__tests__/issue-thread-interactions-service.test.ts`
- `server/src/__tests__/issue-thread-interaction-routes.test.ts`
- `server/src/routes/issues.ts` only for interaction lifecycle endpoints

Tasks:

- [x] A1. Compare local contracts with upstream `#4244`
  (`a95739442027bdec8d291030a91e351dc434f635`) for:
  `ask_user_questions`, `suggest_tasks`, and `request_confirmation`.
- [x] A2. Port only compatible shared types/constants/validators for the local
  architecture.
- [x] A3. Add service operations for creating and resolving supported
  interactions with idempotency, company boundary checks, issue boundary checks,
  and terminal-state guards.
- [x] A4. Add board/agent route coverage for creation and resolution operations
  that should be available locally.
- [x] A5. Preserve existing cancellation semantics and continuation wakeups.
- [x] A6. Add focused backend/shared tests for happy paths, duplicate
  idempotency, cross-company rejection, stale/terminal rejection, and wakeup
  behavior.
- [x] A7. Return a residual map for any upstream `#4244` behavior not ported.

Reviewer A remediation notes:

- `suggest_tasks` acceptance from upstream `#4244` is explicitly deferred in
  this slice. Local code may create and reject `suggest_tasks` interactions for
  operator review, but it must not expose an accept contract that implies child
  issue creation until a safe `acceptSuggestedTasks` implementation handles
  company scope, parent/goal/project validation, assignee validation, activity
  logging, and idempotent issue creation.
- The local accept endpoint is therefore narrowed to the implemented
  `request_confirmation` accept path. Requests carrying `selectedClientKeys`
  are invalid contract inputs, not pending no-op task creation.
- Terminal-state resolution must be protected by the database write predicate,
  not only by the route/service caller's stale issue snapshot.
- `packages/shared/src/issue-thread-interactions.test.ts` is part of Slice A
  closure proof and must be listed in the focused proof output whenever the
  shared interaction contract changes.

Acceptance criteria:

- Local backend can represent and resolve the selected structured interaction
  kinds safely.
- `ask_user_questions` can be answered through a real contract, not only
  cancelled.
- Unsupported upstream behavior is explicitly documented as deferred.
- Shared contract tests are included in the Slice A proof lane when shared
  validators/types are touched.

## Slice B: Issue UI Response And Review Cards

Status: completed

Owner: worker B

Depends on:

- Slice A contract decisions for exact payload/result shapes.

Write scope:

- `ui/src/api/issues.ts`
- `ui/src/components/IssueThreadInteractionCard.tsx`
- `ui/src/components/IssueThreadInteractionCard.test.tsx`
- `ui/src/components/IssueRunLedger.tsx`
- `ui/src/components/IssueRunLedger.test.tsx`
- `ui/src/lib/issue-thread-interactions.ts`
- `ui/src/lib/issue-thread-interactions.test.ts`
- `ui/src/pages/IssueDetail.tsx`
- optional fixtures/stories if locally useful

Tasks:

- [x] B1. Adapt UI cards for answerable `ask_user_questions` instead of
  read-only choices when backend supports answers.
- [x] B2. Add UI affordances for supported `suggest_tasks` and
  `request_confirmation` states if Slice A ports them.
- [x] B3. Keep pending/cancelled/answered/accepted/rejected/expired/failed
  states visually distinct.
- [x] B4. Ensure optimistic/pending UI never hides API failures.
- [x] B5. Add focused tests for answer submission, cancel fallback, terminal
  rendering, and no duplicate submit.
- [x] B6. Prepare browser-proof script updates for the full interaction flow.

Acceptance criteria:

- Operators can answer supported structured interaction cards from the issue
  activity ledger.
- Console/network browser-proof verifies the complete UI flow.

## Slice C: Issue Delete/Cleanup 500

Status: completed

Owner: worker C

Write scope:

- `server/src/routes/issues.ts` only for delete route if needed.
- `server/src/services/issues.ts` or related issue cleanup service if present.
- `server/src/__tests__/*issue*delete*` or nearest existing issue route tests.
- `packages/db/src/schema/*` only if a missing cascade is the root cause.

Tasks:

- [x] C1. Reproduce the `DELETE /api/issues/:id` 500 using a temporary issue
  with issue-thread interactions.
- [x] C2. Identify exact foreign-key or route/service failure from logs/tests.
- [x] C3. Fix deletion semantics without weakening company boundaries.
- [x] C4. Add regression tests for deleting an issue with:
  issue-thread interactions, activity events, comments, approvals if relevant,
  and no child blockers.
- [x] C5. Verify API returns a clean success or an intentional typed error.
- [x] C6. Return cleanup guidance for existing temporary proof issues.

Acceptance criteria:

- Deleting a temporary proof issue with interactions no longer returns 500.
- Regression tests prove the failure class.

## Slice D: Backup/Restore Parity Guardrails

Status: completed

Owner: worker D

Write scope:

- `packages/db/src/backup-lib.ts`
- `packages/db/src/backup-lib.test.ts`
- `doc/DATABASE.md`
- `doc/DEVELOPING.md`
- `doc/UPSTREAM-BACKPORT-STATUS.md` if status changes.

Tasks:

- [x] D1. Re-read local cursor-batched backup implementation against upstream
  `#4859/#4960` and current `pg_dump` path.
- [x] D2. Determine whether an additional bounded safety improvement is needed:
  streaming writer guarantees, explicit max row/byte guardrails, or docs-only.
- [x] D3. Implement the selected improvement if non-invasive.
- [x] D4. Add focused tests proving the guarantee.
- [x] D5. Ensure docs state exact behavior and remaining non-`pg_dump` limits.

Acceptance criteria:

- Backup/restore residual is either eliminated or represented as a precise,
  tested, documented limitation.

## Review Assignments

Status: completed

- [x] R1. Slice A reviewed by a non-A worker or root.
- [x] R2. Slice B reviewed by a non-B worker or root.
- [x] R3. Slice C reviewed by a non-C worker or root.
- [x] R4. Slice D reviewed by a non-D worker or root.
- [x] R5. Root performs final side-by-side review against this plan.

## Final Proof Plan

Status: completed except commit/push

- [x] P1. Focused backend/shared interaction lifecycle tests.
- [x] P2. Focused UI interaction card/ledger tests.
- [x] P3. Focused delete/cleanup regression tests.
- [x] P4. Focused backup/restore tests.
- [x] P5. Package typechecks for touched packages.
- [x] P6. Browser-proof with console/network for answer/cancel/cleanup flow.
- [x] P7. `pnpm test:run`
- [x] P8. `pnpm build`
- [x] P9. `git diff --check`
- [ ] P10. Commit and push.

Proof artifacts:

- Focused Vitest: 8 files, 69 tests passed.
- Full Vitest: 298 files, 1803 tests passed, 1 skipped.
- Typecheck: `pnpm -r typecheck` passed.
- Build: `pnpm build` passed with the existing Vite chunk-size warning.
- Browser-proof: `.tmp/browser-proof/residuals-2026-05-04/issue-interactions-browser-proof.md`.
- Browser-proof issue kept for inspection: `http://127.0.0.1:3101/ROF/issues/ROF-21`.
- Independent final review: GO, no findings.
