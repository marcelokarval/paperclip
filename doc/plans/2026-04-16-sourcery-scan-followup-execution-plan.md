# 2026-04-16 Sourcery Scan Follow-up Execution Plan

Status: Active
Owner: repo security / bug-hunt lane
Umbrella issue: [#12](https://github.com/marcelokarval/paperclip/issues/12)
Scope: End-to-end triage and remediation tracking for the remaining findings from
the Sourcery repository scan screenshot reviewed on 2026-04-16

## Purpose

This plan exists to prevent scan drift.

The screenshot-driven security sweep produced a mixed queue:

- real code findings
- dependency/supply-chain findings
- hardening/configuration findings
- scanner false positives

This document is the executive tracker for the whole queue. It must be updated
as each finding moves through:

1. triage
2. issue creation or closure
3. patch / PR
4. Sourcery review
5. merge / closure

## Operating Rules

- Use the fork as the remediation workspace and compare against
  `paperclipai/paperclip` before concluding a finding is still open in source.
- Keep `#12` as the umbrella and prefer one child issue per real follow-up
  slice.
- When Sourcery feedback on a remediation PR becomes a new slice of work, open a
  new issue and new PR rather than stretching the same PR indefinitely.
- Mark scanner findings as false positives only after code-level inspection is
  written down in the child issue.
- For dependency findings, always answer three questions:
  - is the vulnerable package actually present in the resolved tree?
  - is the affected feature path used in Paperclip?
  - is the official upstream already ahead of the fork on this item?

## Scan Inventory

### Already processed

| Finding | Class | Tracking | Status | Resolution |
| --- | --- | --- | --- | --- |
| `lodash-es` via `mermaid` | dependency | `#31` / PR `#32` | closed | upgraded resolution to `lodash-es@4.18.1` |
| Bracket-notation injection in Express | code hardening | `#35` / PR `#38` | closed | hardened header-map normalization and added regressions |
| XSS from user input written to Express response | code triage | `#34` | closed | false positive after source review |
| `Object.assign` disclosure in `issues.ts` | code triage | `#36` | closed | false positive after source review |

### Active / remaining

| Finding | Class | Tracking | Status | Next action |
| --- | --- | --- | --- | --- |
| Path traversal from user input in `path.join/path.resolve` | code / policy | `#33`, `#37` | active | finish exhausting path sites and separate false positives from explicit filesystem-authority surfaces |
| `defu` prototype pollution | dependency | TBD | pending | confirm resolved package, reachability, upstream state, then remediate or close |
| `kysely` SQL injection via JSON path keys | dependency / code usage | TBD | pending | find actual Kysely usage and determine whether the vulnerable pattern is reachable |
| `drizzle-orm` SQL identifier injection | dependency / code usage | TBD | pending | inspect Paperclip Drizzle callsites for dynamic identifier construction |
| `fast-xml-parser` XML entity expansion bypass | dependency / parser usage | TBD | pending | determine whether XML parsing is used at all in reachable product paths |
| `path-to-regexp` ReDoS | dependency / routing | TBD | pending | identify actual consumer surfaces and whether user-controlled patterns exist |
| `picomatch` ReDoS | dependency / globbing | TBD | pending | inspect globbing surfaces for attacker-controlled extglob input |
| Dockerfile root-user RCE hardening | container hardening | TBD | pending | inspect Dockerfiles and runtime assumptions, then decide remediable hardening scope |
| Generic API key detected | secrets / docs | TBD | pending | locate the exact string, classify as real secret vs example, and remediate accordingly |
| Unpinned third-party GitHub Actions | CI hardening | TBD | pending | audit workflow actions and replace floating refs with pinned SHAs where appropriate |
| `esbuild` dev-server request exposure | dependency / dev-only surface | TBD | pending | verify whether Paperclip exposes affected dev-server mode in reachable operator flows |
| Insecure `ws://` disclosure in browser/docs | docs / config hygiene | TBD | pending | confirm whether this is documentation-only or an actual browser/runtime surface |

## Recommended Execution Order

### Wave A — Highest-value remaining code / policy surface

1. `#33` / `#37` complete the path-traversal and explicit-filesystem-authority
   split
2. `defu`
3. `kysely`
4. `drizzle-orm`

### Wave B — Reachability-first parser / pattern dependencies

5. `fast-xml-parser`
6. `path-to-regexp`
7. `picomatch`
8. `esbuild`

### Wave C — Hardening and hygiene

9. Dockerfile root-user finding
10. unpinned GitHub Actions
11. generic API key finding
12. `ws://` disclosure finding

## Per-item Closure Standard

Each finding is only done when all are true:

1. a child issue exists or the finding has been explicitly closed as
   non-actionable
2. upstream-vs-fork status has been checked and recorded
3. exploitability/reachability has been stated clearly
4. if patched, a PR exists and its verification commands are recorded
5. Sourcery review on that PR has been classified and handled
6. the child issue and umbrella `#12` have been updated

## Step Ledger

Use this section as the compact tracker while executing.

| Step | Theme | Target finding(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Path / filesystem authority | `#33`, `#37` | active | Partially triaged; path noise identified, filesystem-authority follow-up isolated |
| 2 | Dependency prototype pollution | `defu` | pending | not yet opened |
| 3 | Query-builder injection | `kysely`, `drizzle-orm` | pending | not yet opened |
| 4 | Parser / regex DoS | `fast-xml-parser`, `path-to-regexp`, `picomatch` | pending | not yet opened |
| 5 | Dev-surface dependency review | `esbuild` | pending | not yet opened |
| 6 | Container / CI hardening | Dockerfile, GitHub Actions | pending | not yet opened |
| 7 | Secrets / transport hygiene | generic API key, `ws://` | pending | not yet opened |

## Update Protocol

Whenever a step advances:

- update this plan first
- then update the relevant child issue
- then update umbrella `#12` if the set of active children changed

Do not leave this file stale while opening or closing follow-up issues.
