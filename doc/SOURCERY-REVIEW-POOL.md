# Sourcery Review Pool

Status: Internal engineering review pool
Date: 2026-04-15
Scope: Durable backlog for Sourcery review items that were analyzed but not
landed immediately in the PR that triggered them

## Purpose

This document exists to prevent review loss.

When Sourcery leaves feedback on a pull request, each item must be classified
explicitly:

- **land now** when the feedback materially improves correctness, proof, or
  maintainability at low risk in the current PR
- **pool for later** when the feedback is valid but does not justify expanding
  the current PR scope
- **decline** when the feedback is already covered, technically incorrect, or
  mismatched to the repository state

If an item is not landed now but still has future ROI, it must be recorded here
before the PR is merged.

## Methodology

For every PR that receives Sourcery feedback:

1. Read the full Sourcery review and any inline comments.
2. Classify each item as `land now`, `pool for later`, or `decline`.
3. If an item is pooled, add a short entry to this file with:
   - PR link
   - issue link if relevant
   - Sourcery summary
   - local analysis
   - action decision
4. Leave a closing PR comment stating that:
   - Sourcery feedback was reviewed
   - deferred items were recorded in this document
   - the PR is being merged with that record preserved
5. Only then merge the PR.

## Status Model

Entries in this document represent items whose initial classification was
`pool for later`.

Within that pooled set:

- `Initial classification` records the original review decision and should stay
  `pool for later` for every entry in this document
- `Current status` records the lifecycle state of the pooled item:
  - `active` when the pooled follow-up still remains relevant
  - `superseded` when a later PR, upstream merge, or repository change makes
    the pooled follow-up obsolete

## Entry Template

```md
## PR #<number> — <title>

- Scope: <one-line summary of the pooled follow-up theme>

- PR: <link>
- Related issue: <link or "none">
- Review source: Sourcery

### Pooled Items

1. **<short title>**
   - Sourcery said: <summary>
   - Analysis: <why it matters, or why it is deferred>
   - Initial classification: pool for later
   - Current status: <active / superseded>
   - Future ROI: <what benefit we expect later>
```

## Active Pooled Items

## PR #17 — test(server): fix wakeup coalescing coverage

- Scope: wakeup coalescing test maintenance and helper extraction follow-up

- PR: https://github.com/marcelokarval/paperclip/pull/17
- Related issue: https://github.com/marcelokarval/paperclip/issues/13
- Review source: Sourcery

### Pooled Items

1. **Extract small helpers for coalescing test setup**
   - Sourcery said: the two coalescing tests now duplicate setup and the
     `coalescedWake` query, so small helpers/factories would make the suite
     easier to maintain.
   - Analysis: valid maintainability feedback. The review's primary testing
     suggestion was checked against `server/src/services/heartbeat.ts` and
     declined because the issue-lock coalescing path intentionally inserts a
     new `coalesced` wake row rather than preserving a single wake row per
     run. Helper extraction remains a worthwhile follow-up, but it broadens
     the patch into a test refactor rather than bounded proof hardening.
   - Initial classification: pool for later
   - Current status: active
   - Future ROI: reduces duplicated fixture drift in a workflow suite that is
     likely to keep growing as wake/coalescing cases expand.

## PR #8 — docs: expand technical wake workflow map

- Scope: technical map clarity and code-navigation follow-ups

- PR: https://github.com/marcelokarval/paperclip/pull/8
- Related issue: https://github.com/marcelokarval/paperclip/issues/7
- Review source: Sourcery

### Pooled Items

1. **Snapshot caveat in technical map header**
   - Sourcery said: clarify that date, branch, and adapter status are
     point-in-time observations that may diverge quickly.
   - Analysis: good documentation hygiene, especially for a fork that compares
     itself against upstream often. It is useful, but it does not block the
     current doc PR because the file already states `Repository snapshot
     analysis of the current checkout`.
   - Initial classification: pool for later
   - Current status: active
   - Future ROI: lowers the chance that future readers misread the map as an
     evergreen architecture contract.

2. **Function-location jump hints in detailed wake flow**
   - Sourcery said: annotate key steps in the detailed wake flow with function
     definitions/locations so readers can jump directly to the code.
   - Analysis: high-value for maintenance, but it expands the doc with more
     code-level pointers and is better done together with a broader pass on
     `TECHNICAL-MAP.md`.
   - Initial classification: pool for later
   - Current status: active
   - Future ROI: makes the technical map more actionable during future bug
     hunts and upstream/fork comparisons.

## PR #9 — fix(server): preserve enriched wake context when coalescing

- Scope: shared test-infrastructure cleanup for server wake workflow suites

- PR: https://github.com/marcelokarval/paperclip/pull/9
- Related issue: https://github.com/marcelokarval/paperclip/issues/4
- Review source: Sourcery

### Pooled Items

1. **Shared helper for `PAPERCLIP_HOME` + embedded Postgres test setup**
   - Sourcery said: the setup/teardown logic for `PAPERCLIP_HOME` and embedded
     Postgres is now duplicated across suites and should be centralized.
   - Analysis: valid structural cleanup, but broader than the current bugfix
     and should be done as a dedicated test-infrastructure pass rather than as
     incidental churn inside the wake workflow PR.
   - Initial classification: pool for later
   - Current status: active
   - Future ROI: reduces test fragility and avoids repeated environment-handling
     drift across server suites.

## PR #30 — test(server): reduce route-test startup overhead

- Scope: shared helper extraction for cached route-module test harnesses

- PR: https://github.com/marcelokarval/paperclip/pull/30
- Related issue: https://github.com/marcelokarval/paperclip/issues/25
- Review source: Sourcery

### Pooled Items

1. **Extract the repeated `loadAppModules` helper into shared test support**
   - Sourcery said: the `loadAppModules` / `appModulesPromise` pattern is now
     duplicated across the four route tests with only minor variations and
     should be centralized.
   - Analysis: valid maintainability feedback. The current PR already landed the
     correctness fix for `cli-auth-routes.test.ts` and documented why the
     per-file singleton cache is safe, but extracting a shared helper would
     broaden the patch into a cross-suite refactor.
   - Initial classification: pool for later
   - Current status: active
   - Future ROI: reduces duplicated caching logic and lowers the chance that one
     route-test file drifts away from the others during future performance
     tuning.
