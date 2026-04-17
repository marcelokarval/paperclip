# Upstream PR Monitoring Ledger Template

Status: Active
Owner: `<owner / lane>`
Fork repo: `marcelokarval/paperclip`
Upstream repo: `paperclipai/paperclip`
Monitoring window: `<date range or release window>`
Last refresh date: `YYYY-MM-DD`
Last PR analyzed: `#<upstream-pr-number> - <title>`
Last PR analyzed at: `YYYY-MM-DD`
Next PR to inspect: `#<upstream-pr-number> - <title>` or `none`
Local tracking issue: `<issue link>` or `none`

## Purpose

Use this ledger whenever upstream merged PRs are being monitored for possible
intake into this fork.

This document is not a sync log. It is a decision log.

Every upstream PR in scope must be recorded here even when the final decision is
`ignore`.

## Mandatory Operating Rules

1. Read the upstream PR or commit diff before classifying it.
2. Compare the upstream change against the current fork source, not against
   memory.
3. Record the exact `Last PR analyzed` in the header after each completed
   review.
4. Do not skip a PR because it "looks irrelevant". Record the analysis and the
   reason for ignoring it.
5. If a PR should be absorbed, link the local issue and PR that carry the work.
6. If a PR is only partially relevant, say which parts matter and which do not.
7. Keep the ledger ordered newest-first or oldest-first consistently for the
   whole file.

## Decision Vocabulary

Use these normalized values in the ledger:

- `pending`
- `in analysis`
- `absorbed`
- `adapt locally`
- `defer`
- `ignore`

`absorbed` means the upstream change was brought in materially.
`adapt locally` means the upstream idea matters, but our fork needs a different
implementation shape.
`defer` means it may still be useful later.
`ignore` means it is intentionally not needed for this fork.

## Per-PR Analysis Contract

For every upstream PR, answer all of these:

1. What changed upstream?
2. Where did it change?
3. Do we already have equivalent behavior locally?
4. Does it matter for our forked runtime and product direction?
5. Should we absorb it, adapt it, defer it, or ignore it?
6. If not absorbed, why not?

## PR Ledger

| Upstream PR | Merged at | Area | Summary of upstream change | Fork comparison | Decision status | Incorporated into fork? | Local tracking | Reason / rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#0000` | `YYYY-MM-DD` | `<heartbeat / ui / routes / adapters / docs / release / etc.>` | `<1-2 sentence factual summary>` | `<already equivalent / partially equivalent / absent / diverged by design>` | `pending` | `no` | `none` | `<why this matters or not>` |
| `#0001` | `YYYY-MM-DD` | `<area>` | `<summary>` | `<comparison>` | `defer` | `no` | `#123` | `<reason>` |

## Intake Follow-up Ledger

Use this section only when an upstream PR triggers local work.

| Upstream PR | Local issue | Local PR | Outcome | Notes |
| --- | --- | --- | --- | --- |
| `#0001` | `#123` | `#456` | `merged` | `<absorbed directly / adapted locally / intentionally narrowed>` |

## Update Protocol

After each upstream PR review:

1. Update the row for that PR.
2. Update `Last PR analyzed`.
3. Update `Last PR analyzed at`.
4. Update `Next PR to inspect`.
5. If local work is needed, open the local issue and PR and link them
   immediately.

Do not leave the header stale after analyzing a PR.
