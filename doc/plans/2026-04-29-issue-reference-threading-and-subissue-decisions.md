# Issue References, Threads, and Ordered Sub-Issues Decisions

Date: 2026-04-29

## Context

PR Local 4 reviewed upstream-style issue context and governance improvements against the local V1 model.
The local product already supports issue identifiers, markdown issue links, flat issue comments, parent/sub-issues, and blocker relations.

## Decisions

### Issue References

Blocker relations are first-class durable issue edges today. Inline issue references in markdown are navigational rendering only.

Durable non-blocking reference edges such as `related`, `mentioned_by`, `duplicate`, or external-system reference graphs are deferred until the product accepts a broader relation model.

### Issue Thread Model

Issue comments remain a flat canonical work thread. Wake payloads may carry structured comment IDs and inline comment windows, but the persisted model does not support nested replies, comment resolution, or cross-issue thread aggregation.

Nested/threaded comments are deferred until a broader collaboration model is approved.

### Ordered Sub-Issues

`parentId` is structural. It does not imply execution order, blocking, or checklist completion.

Execution dependencies must continue to use `blockedByIssueIds`. Ordered display, checklist state, or workflow sequencing require explicit fields or a dedicated checklist entity before implementation.

## Compatible Immediate Scope

- Keep markdown issue-link rendering safe for configurable prefixes and external URLs.
- Normalize escaped multiline human text at the API validation boundary for issue and approval comments/decision notes.
- Document that richer reference/thread/checklist models are deferred rather than partially encoding them into descriptions or implicit ordering.

## Deferred Work

- Durable non-blocking issue reference graph.
- Threaded comments and comment resolution.
- Ordered sub-issue/checklist persistence.
- Any execution semantics that infer order from `parentId`.
