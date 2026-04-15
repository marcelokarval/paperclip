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

## Entry Template

```md
## PR #<number> — <title>

- PR: <link>
- Related issue: <link or "none">
- Review source: Sourcery

### Pooled Items

1. **<short title>**
   - Sourcery said: <summary>
   - Analysis: <why it matters, or why it is deferred>
   - Decision: <pool / decline / superseded>
   - Future ROI: <what benefit we expect later>
```

## Active Pooled Items

## PR #8 — docs: expand technical wake workflow map

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
   - Decision: pool for later unless folded into a nearby doc pass.
   - Future ROI: lowers the chance that future readers misread the map as an
     evergreen architecture contract.

2. **Function-location jump hints in detailed wake flow**
   - Sourcery said: annotate key steps in the detailed wake flow with function
     definitions/locations so readers can jump directly to the code.
   - Analysis: high-value for maintenance, but it expands the doc with more
     code-level pointers and is better done together with a broader pass on
     `TECHNICAL-MAP.md`.
   - Decision: pool for later.
   - Future ROI: makes the technical map more actionable during future bug
     hunts and upstream/fork comparisons.

## PR #9 — fix(server): preserve enriched wake context when coalescing

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
   - Decision: pool for later.
   - Future ROI: reduces test fragility and avoids repeated environment-handling
     drift across server suites.
