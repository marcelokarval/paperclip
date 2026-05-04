# Upstream Backport Status

Last updated: 2026-05-04

This fork uses selective upstream backports. Do not infer that upstream
`master` was merged wholesale.

## Current Local Integration Marker

- Last upstream PR reviewed before this selective backport window: `#3679`
- Latest upstream PR selectively integrated in this local fork: `#4981`
- Latest upstream issue explicitly addressed in this local fork: `#5086`
- Execution plan: `doc/plans/2026-05-03-selective-upstream-backport-executive-plan.md`

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

## Addressed Issue References

- `#4759`: sensitive URL/query redaction for HTTP and auth middleware logging.
- `#4833`: project deletion cost-event cleanup through project service removal.
- `#5086`: issue deletion cost-event cleanup.

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
