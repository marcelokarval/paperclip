# Follow-up Backport Execution Plan

Date: 2026-05-04

## Objective

Close the remaining post-`#4981` local follow-ups without performing a full
upstream merge.

## Scope

- Slice A: refresh local backport status docs after the fixed UI typecheck
  residual.
- Slice B: selectively port the `#4862` issue-thread interaction cancellation
  foundation and cancel flow.
- Slice C: selectively port `#4859` / `#4960` backup and restore schema
  hardening.

## Execution Rules

- Preserve the clean worktree boundary before each slice.
- Do not merge upstream wholesale.
- Each implementation slice must be reviewed by someone other than its worker.
- The orchestrator performs final integration review only.
- Browser-proof is required only for UI-visible Slice B behavior.

## Slice A: Status Documentation Refresh

Status: completed

Tasks:

- [x] A1. Remove stale claim that UI typecheck remains red in
  `IssueProperties.test.tsx`.
- [x] A2. Record that `pnpm --filter @paperclipai/ui typecheck`,
  `@paperclipai/server typecheck`, and `@paperclipai/shared typecheck` passed
  after commit `f7c93178`.
- [x] A3. Keep `#4862` cancellation and `#4859/#4960` backup hardening as active
  follow-ups until their slices land.

## Slice B: Issue Thread Interaction Cancellation

Status: completed with scoped residuals

Upstream source:

- `#4862`: `c4269bab59fff7a73ff31797578cc97ece7f160f`

Tasks:

- [x] B1. Compare local interaction/thread primitives against upstream
  `issue_thread_interactions` files.
- [x] B2. Add or adapt `cancelled` interaction status and result typing in
  shared contracts.
- [x] B3. Add server-side cancellation service behavior for pending question
  interactions.
- [x] B4. Add board-only `POST /api/issues/:id/interactions/:interactionId/cancel`
  route with company and issue access checks.
- [x] B5. Wire UI API/query keys and cancel affordance where interaction cards
  are rendered.
- [x] B6. Ensure cancellation is not confused with queued-comment cancellation.
- [x] B7. Add focused server and UI tests.
- [x] B8. Run focused tests and browser-proof for the cancellation affordance
  if a reliable local runtime is available.
- [x] B9. Worker self-review and self-forensic review.
- [x] B10. Independent reviewer validation.

Slice B residual:

- This is a minimum coherent local cancellation/listing backport for
  `ask_user_questions` interactions. It does not claim to deliver every
  upstream interaction creation/respond/suggest/confirmation flow.
- Browser-proof artifact: `.tmp/slice-b-browser-proof.md`.

## Slice C: Backup/Restore Schema Hardening

Status: completed

Upstream sources:

- `#4859`: `cd606563f640f0067f802b8e552b990cb1c65ce5`
- `#4960`: `d7719423e90b2228223fa6ca3873b0d8b0cb1560`

Tasks:

- [x] C1. Compare local `packages/db/src/backup-lib.ts` against upstream `#4859`
  and `#4960`.
- [x] C2. Include non-system schemas in JavaScript and `pg_dump` backup paths
  where compatible.
- [x] C3. Preserve enum, table, sequence, index, constraint, migration, and
  plugin-schema objects across restore where compatible.
- [x] C4. Exclude PostgreSQL-owned schemas via reserved `pg_` prefix plus
  `information_schema`.
- [x] C5. Add focused backup/restore tests for plugin/non-public schemas and
  Drizzle migration history.
- [x] C6. Update DB docs to clarify logical database backup boundaries.
- [x] C7. Run `pnpm exec vitest run packages/db/src/backup-lib.test.ts` or record
  environmental blockers precisely.
- [x] C8. Worker self-review and self-forensic review.
- [x] C9. Independent reviewer validation.

Slice C residual:

- The local JavaScript backup path still does not claim full `pg_dump` parity or
  streaming safety for very large tables. Docs now describe the supported object
  set and exclusions.

## Final Closure

Status: completed

- [x] Confirm worktree state before final commit.
- [x] Run focused tests from Slices B and C:
  `pnpm exec vitest run server/src/__tests__/issue-thread-interactions-service.test.ts server/src/__tests__/issue-thread-interaction-routes.test.ts ui/src/components/IssueThreadInteractionsPanel.test.tsx`
  and `pnpm exec vitest run packages/db/src/backup-lib.test.ts`.
- [x] Run typechecks for affected packages:
  `pnpm --filter @paperclipai/server typecheck` and
  `pnpm --filter @paperclipai/ui typecheck`.
- [x] Run global proof:
  `pnpm test:run` passed with 289 files, 1751 tests passed, and 1 skipped;
  `pnpm build` passed.
- [x] Update `doc/UPSTREAM-BACKPORT-STATUS.md` with final integrated markers.
- [x] Commit and push only after review and proof gates pass.
