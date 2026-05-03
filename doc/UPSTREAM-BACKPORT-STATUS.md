# Upstream Backport Status

Last updated: 2026-05-03

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
- `#4862`: issue subtree cost summaries. Interaction cancellation remains a
  follow-up because the upstream issue-thread interaction subsystem is not
  present in this fork.
- `#4957`: live-run comment context.
- `#4963`: live-run no-padding default and explicit padding tests.
- `#4863`: compatible board/settings/skills workflow polish.
- `#4981`: company/workspace switcher consolidation in sidebar.

## Addressed Issue References

- `#4759`: sensitive URL/query redaction for HTTP and auth middleware logging.
- `#4833`: project deletion cost-event cleanup through project service removal.
- `#5086`: issue deletion cost-event cleanup.

## Explicit Follow-Ups

- `#4862` interaction cancellation requires a separate foundational
  issue-thread interaction subsystem port.
- `#4960` / `#4859` backup schema and restore hardening remain separate follow-up
  work because the upstream diff is broader than this selective backport slice.
- UI package typecheck still has a local fixture residual in
  `ui/src/components/IssueProperties.test.tsx`.
