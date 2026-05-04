# Issue Interactions And Backup Residuals Plan

Date: 2026-05-04

## Objective

Close the remaining local residuals around upstream `#4862`, backup/restore
confidence, and the contradictory upstream backport status document.

This plan intentionally does not merge upstream wholesale. It ports or adapts
only the parts that fit this fork's current architecture.

## Operating Rules

- The root assistant is the orchestrator and final reviewer, not the primary
  executor.
- Implementation tasks are owned by workers with disjoint write scopes where
  possible.
- Every implementation slice must have an independent review by someone other
  than its worker.
- Browser-proof is mandatory for UI-visible interaction behavior and must
  include console and network inspection.
- The final closure must repeat integrated proof after all slices land.
- Idle agents must be closed after returning usable output.

## Current State

- Local commit `307cef43` added a minimum coherent local
  `ask_user_questions` issue-thread interaction foundation:
  database table, list/cancel API, board-only cancellation, issue detail
  rendering, and cancellation tests.
- Local issue subtree cost summary support from upstream `#4862` is already
  present.
- Local backup/restore supports non-system schemas on the JavaScript backup
  path, but does not claim full `pg_dump` parity or streaming safety for very
  large tables.
- Slice D removed the contradictory `#4859/#4960` follow-up note from
  `doc/UPSTREAM-BACKPORT-STATUS.md` while preserving the local
  JavaScript-path-only closure scope.

## Slice A: Upstream `#4862` Interaction UI Parity

Status: completed with scoped local interaction contract

Owner: worker A

Write scope:

- `ui/src/components/IssueThreadInteractionCard.tsx`
- `ui/src/components/IssueThreadInteractionCard.test.tsx`
- `ui/src/components/IssueRunLedger.tsx`
- `ui/src/components/IssueRunLedger.test.tsx`
- `ui/src/components/IssueChatThread.tsx`
- `ui/src/lib/issue-thread-interactions.ts`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/api/issues.ts`
- `ui/src/lib/queryKeys.ts`
- focused UI tests only when directly required

Tasks:

- [x] A1. Compare local UI interaction rendering against upstream
  `c4269bab59fff7a73ff31797578cc97ece7f160f`.
- [x] A2. Replace the temporary/simple issue interaction panel with an adapted
  card/ledger model compatible with this fork's `IssueDetail` page.
- [x] A3. Render pending, answered, cancelled, expired, and failed interaction
  states explicitly.
- [x] A4. Keep cancellation board-only and visually distinct from queued comment
  cancellation.
- [x] A5. Interleave issue-thread interactions with run/activity chronology
  where the current fork has enough data to do so safely.
- [x] A6. Preserve the existing issue cost summary display and avoid regressing
  the subtree cost work already present.
- [x] A7. Add focused UI tests for rendering, cancellation affordance, and
  chronological presentation.
- [x] A8. Run focused UI tests and typecheck for touched UI surfaces.
- [x] A9. Return self-review and self-forensic review, including any parity
  gaps that are intentionally not ported.

Acceptance criteria:

- Operators can see pending and terminal workflow interactions in the issue
  conversation/ledger surface, not only in a standalone temporary panel.
- Cancelled interactions render with reason/result state.
- Focused component tests cover the new presentation.
- Pending `ask_user_questions` choices are rendered read-only because this
  fork does not yet expose a submit-answer endpoint.
- The obsolete `IssueThreadInteractionsPanel` component was removed.

## Slice B: Interaction Lifecycle Breadth Audit

Status: completed

Owner: worker B

Write scope:

- Prefer read-only analysis first.
- If implementation is justified and bounded, write only:
  - `server/src/services/issue-thread-interactions.ts`
  - `server/src/routes/issues.ts`
  - `server/src/__tests__/issue-thread-interactions-service.test.ts`
  - `server/src/__tests__/issue-thread-interaction-routes.test.ts`
  - `packages/shared/src/types/issue.ts`
  - `packages/shared/src/validators/issue.ts`
  - directly necessary shared exports/constants

Tasks:

- [x] B1. Determine whether creation, response, suggestions, and confirmations
  are actually part of upstream `#4862` or belong to adjacent upstream work.
- [x] B2. Compare local interaction table/contracts with upstream and identify
  missing lifecycle operations by kind/status/result.
- [x] B3. If `#4862` itself contains missing backend lifecycle operations, port
  them with company/issue boundary checks and focused tests.
- [x] B4. If lifecycle operations belong outside `#4862`, document the exact
  upstream source references and do not fabricate incompatible behavior.
- [x] B5. Ensure any new behavior preserves board/agent permission boundaries.
- [x] B6. Return a precise go/no-go and residual map.

Acceptance criteria:

- The plan no longer uses vague language like "not all flows" without source
  attribution.
- Any truly missing `#4862` backend lifecycle behavior is either implemented or
  explicitly classified as outside `#4862`.
- Creation, response, `suggest_tasks`, and `request_confirmation` were
  attributed to upstream `#4244`, not `#4862`.
- The actual missing `#4862` backend parity gap, cancellation continuation
  wakeup, was implemented and reviewed.

## Slice C: Backup/Restore Streaming And `pg_dump` Parity

Status: completed

Owner: worker C

Write scope:

- `packages/db/src/backup-lib.ts`
- `packages/db/src/backup-lib.test.ts`
- `doc/DATABASE.md`
- `doc/DEVELOPING.md`

Tasks:

- [x] C1. Audit the current JavaScript backup path for large-table memory risks.
- [x] C2. Compare local backup behavior against upstream `#4859/#4960` and the
  current `pg_dump` path.
- [x] C3. Implement the safest bounded improvement available without converting
  the whole backup system into a wholesale upstream merge.
- [x] C4. If true streaming is not feasible inside this slice, make the runtime
  behavior explicit and fail/warn predictably for unsafe table sizes instead of
  silently overclaiming.
- [x] C5. Add tests that prove the selected behavior: streaming/chunking if
  implemented, or explicit guardrails if not.
- [x] C6. Update docs so backup guarantees match the actual implementation.
- [x] C7. Run focused DB tests and package typecheck.
- [x] C8. Return self-review and self-forensic review with residual risks.

Acceptance criteria:

- The backup path no longer leaves an ambiguous "streaming safety" residual.
- Docs and behavior agree.
- Focused backup tests pass.
- JavaScript backups now read table data in bounded cursor batches and drain
  writer backpressure between batches.

## Slice D: Backport Status Documentation Cleanup

Status: completed

Owner: worker D

Write scope:

- `doc/UPSTREAM-BACKPORT-STATUS.md`
- this plan file only for task status updates if needed

Tasks:

- [x] D1. Remove the contradiction that says `#4859/#4960` remain a follow-up
  while also saying the local JS path is closed.
- [x] D2. Reword `#4862` status so it distinguishes:
  implemented cost summary,
  implemented minimum cancellation foundation,
  pending UI/ledger parity,
  and lifecycle breadth source-of-truth audit.
- [x] D3. Update the "Last updated" date to 2026-05-04.
- [x] D4. Do not overclaim full upstream parity until Slices A/B/C are reviewed.

Acceptance criteria:

- `doc/UPSTREAM-BACKPORT-STATUS.md` accurately describes what is complete,
  what is partial, and what is pending.

## Independent Review Assignments

Status: completed

- [x] R1. Reviewer for Slice A must inspect UI behavior, tests, and browser-proof
  readiness.
- [x] R2. Reviewer for Slice B must verify source attribution and permission
  boundaries.
- [x] R3. Reviewer for Slice C must verify backup semantics and docs do not
  overclaim.
- [x] R4. Orchestrator performs final integration review across slices and
  repeats proof after all accepted changes land.

## Final Proof Plan

Status: completed

- [x] P1. `pnpm exec vitest run` with focused Slice A/B/C tests.
- [x] P2. `pnpm --filter @paperclipai/ui typecheck`
- [x] P3. `pnpm --filter @paperclipai/server typecheck`
- [x] P4. `pnpm --filter @paperclipai/db typecheck`
- [x] P5. Browser-proof with console and network inspection for interaction
  rendering/cancellation.
- [x] P6. `pnpm test:run`
- [x] P7. `pnpm build`
- [x] P8. Final `git diff --check`
- [x] P9. Commit and push only after all required reviews and proofs pass.

Final proof notes:

- Focused Slice A/B/C tests passed: 6 files, 20 tests.
- UI, server, and DB package typechecks passed.
- Browser-proof passed on `http://127.0.0.1:3101/ROF/issues/ROF-20`.
- Browser-proof artifacts: `.tmp/issue-interactions-browser-proof.md` and
  `.tmp/issue-interactions-browser-proof.png`.
- Browser-proof console/network result: 0 console errors after filtering,
  0 page errors, 0 request failures, 0 HTTP >=400 responses.
- Full `pnpm test:run` passed: 290 files, 1755 passed, 1 skipped.
- Full `pnpm build` passed.
- `git diff --check` passed.
