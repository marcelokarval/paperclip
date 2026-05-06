# Upstream Backport Status

Last updated: 2026-05-06

This fork uses selective upstream backports. Do not infer that upstream
`master` was merged wholesale.

## Current Local Integration Marker

- Last upstream PR reviewed before this selective backport window: `#3679`
- Latest upstream PR reviewed before the current deep-scan batch: `#5285`
- Latest upstream PR reviewed by the current deep-scan batch: `#5356`
- Latest upstream PR selectively integrated in this local fork: `#5323`
- Latest upstream issue explicitly addressed in this local fork: `#5299`
- Previous execution plan: `doc/plans/2026-05-05-recovery-loop-and-upstream-sync-plan.md`
- Current execution batch source: `.tmp/upstream-incremental-scan-2026-05-06.md`
- Current execution batch plan: `doc/plans/2026-05-05-upstream-p0-execution-plan.md`

## Current Incremental Scan - Started 2026-05-06

The 2026-05-06 upstream scan reviewed upstream `master` through `#5356` and
identified a new runtime/control-plane batch. This fork still uses selective
backports; upstream `master` was not merged wholesale.

| Task | Upstream signal | Local batch status | Local result |
| --- | --- | --- | --- |
| UP-20260506-01 | `#5323` manual heartbeat scope preservation | integrated | legacy `/heartbeat/invoke` forwards supplied wake scope fields through `heartbeat.wakeup`; empty-body callers keep the legacy minimal shape |
| UP-20260506-02 | `#5324` sandbox callback allowlist | deferred | upstream depends on remote/sandbox callback bridge files not present in this fork |
| UP-20260506-03 | `#5325` remote execution env sanitization | deferred | upstream depends on remote execution target/SSH boundary files not present in this fork |
| UP-20260506-04 | `#5326` callback bridge concurrency serialization | deferred | upstream depends on `sandbox-callback-bridge`/`ssh` infrastructure not present in this fork |
| UP-20260506-05 | `#5289`, `#5292`, `#5356` recovery/control-plane notices | pending | local recovery logic lives in `server/src/services/heartbeat.ts`, not upstream's split `server/src/services/recovery/` module layout |

Proof for the incremental scan is recorded in
`.tmp/upstream-incremental-scan-2026-05-06.md`.

## Current Execution Batch - Completed 2026-05-05

This batch starts from `.tmp/upstream-deep-scan-2026-05-05.md`. It is a
selective local integration window, not a wholesale upstream merge. Each code
slice below was implemented locally, reviewed by a different reviewer, and then
checked by the root orchestrator.

| Task | Upstream signal | Local batch status | Local result |
| --- | --- | --- | --- |
| UP-P0-01 | `#5229` / `#5237` run-id sanitizer | integrated | invalid run IDs from header/JWT claims are dropped at actor boundary |
| UP-P0-02 | `#5028` / `#5240` / `#5276` Codex auth home/API-key auth | integrated | managed Codex home avoids stale auth copies and supports API-key probe auth |
| UP-P0-03 | `#5184` / `#5238` routine scheduler isolation | integrated | per-trigger failures are isolated and logged without aborting scheduler ticks |
| UP-P0-04 | `#5197` / `#5239` heartbeat output cap | integrated | heartbeat summary/list projection caps large output/result/error text |
| UP-P0-05 | `#5307` execution stage/checkout state recovery | integrated | checkout adoption preserves execution agent identity and active run locks |
| UP-P0-06 | `#5267` agent/hire idempotency | integrated | agent and CTO-hire creation paths have server-derived idempotency |
| UP-P0-07 | `#5299` corrected provider rate-limit pause/resume | integrated | provider hard-rate-limit blocks persist, pause/resume agents, block/unblock issues, and expose API/UI release |
| UP-P1-01 | status and plan docs for this execution batch | integrated | docs updated with final status and proof |

Proof for this batch is recorded in
`doc/plans/2026-05-05-upstream-p0-execution-plan.md`.

## Migration Numbering Policy For Selective Backports

This fork's current migration chain owns local migration
`0063_provider_rate_limit_blocks.sql`. The official upstream repository has
already moved beyond this number, so future upstream database backports must
not be copied by filename without reconciliation.

Required handling before the next migration-bearing upstream backport:

- Compare the upstream migration body with the local migration chain.
- Keep the local journal strictly monotonic for this fork.
- Rename or re-number incoming upstream migrations when the numeric slot is
  already occupied locally.
- Record the source upstream PR/issue in this file when a migration is adapted.

## Integrated Upstream References

- `#4804`: runtime state race, local runtime-service cleanup equivalent, and
  orphaned-run recovery hardening.
- `#4875`: issue recovery reliability hardening where compatible with this fork.
- `#4956`: productive terminal continuation recovery.
- `#4383`: Codex/Claude transient classification and retry metadata support.
- `#4881`: local adapter model profiles, including executable `cheap` profile
  support in heartbeat runtime.
- `#4861`: issue thread / markdown / optimistic comment hardening where
  compatible with local UI.
- `#4862`: issue subtree cost summaries are implemented. A minimum local
  `ask_user_questions` issue-thread interaction cancellation foundation is
  also implemented with list/cancel API, board-only cancellation, issue detail
  rendering, and cancellation tests. UI/ledger parity and interaction lifecycle
  breadth remain pending review items, not claimed full upstream parity.
- `#4957`: live-run comment context.
- `#4963`: live-run no-padding default and explicit padding tests.
- `#4863`: compatible board/settings/skills workflow polish.
- `#4981`: company/workspace switcher consolidation in sidebar.
- `#5222`: Codex usage-limit messages with explicit retry windows are treated
  as transient upstream failures with parsed `retryNotBefore`; auth/setup and
  retry-window-less usage-limit messages remain non-transient.
- `#5294`: retry/release paths now keep `executionRunId` and `checkoutRunId`
  coherent, cancel stale retries that cannot acquire the lock pair, and avoid
  promoting deferred issue wakes from stale claim cleanup.
- `#5180`: undirected/manual non-issue wakes coalesce with any active queued or
  running run for the same agent, while directed different-task wakes and
  comment follow-up behavior remain distinct.
- `#5244`: automation/assignment paths now honor `pausedAt` in addition to
  paused/terminated/pending states, cancel pre-existing queued work for
  non-invokable agents, and re-check invokability under the enqueue lock.
- `#5323`: legacy manual heartbeat invoke now preserves supplied wake scope
  (`reason`, `payload`, `idempotencyKey`, and `forceFreshSession`) instead of
  dropping issue/run targeting.

## Addressed Issue References

- `#4759`: sensitive URL/query redaction for HTTP and auth middleware logging.
- `#4833`: project deletion cost-event cleanup through project service removal.
- `#5086`: issue deletion cost-event cleanup.
- ROF-40 local incident: exhausted `issue_continuation_needed` recovery chains
  followed by failed `process_lost_retry` now escalate the issue to `blocked`
  instead of starting another continuation recovery loop.

## Explicit Follow-Ups

- Full upstream `#4862` parity is not claimed. Local status is split as:
  implemented issue subtree cost summaries, implemented minimum cancellable
  `ask_user_questions` foundation, pending UI/ledger parity, and pending
  lifecycle breadth source-of-truth audit for create/respond/suggest/
  confirmation behavior.
- Backup work tied to `#4960` / `#4859` is closed for this fork's local
  JavaScript backup path only. The local path has cursor-batched writes and
  opt-in per-table row/SQL-byte guardrails, but does not claim upstream's
  `pg_dump` / `psql` engine behavior or full PostgreSQL object parity.
- Full upstream parity through `#5285` is not claimed. `#5285` itself was
  reviewed as the previous upstream marker, but routine revision-history restore
  flow has not been ported in this window.

## Closed Local Residuals

- UI typecheck residual in `ui/src/components/IssueProperties.test.tsx` was
  fixed in local commit `f7c93178`.
- Verified after that fix:
  - `pnpm --filter @paperclipai/ui typecheck`
  - `pnpm --filter @paperclipai/server typecheck`
  - `pnpm --filter @paperclipai/shared typecheck`
- Backup schema/restore hardening from `#4859` / `#4960` was completed for the
  local JavaScript backup path. Docs now state the supported PostgreSQL object
  set, explicit exclusions, cursor-batched write behavior, and optional
  per-table row/SQL-byte guardrails.
