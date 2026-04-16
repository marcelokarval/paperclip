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

## Upstream Sync Matrix (2026-04-16 snapshot)

This matrix tracks the commits currently present in `upstream/master` but not
yet absorbed into this fork.

Fork state at snapshot time:

- `master` is aligned in content with the fork remote, but not yet in exact SHA
  parity
- `master` remains ahead of `origin/master` by local planning/merge bookkeeping
  commits
- `upstream/master` remains ahead of this fork by 17 commits

### Absorb soon

| Commit | Summary | Why it matters |
| --- | --- | --- |
| `1afb6be9` | `fix(heartbeat): add hermes_local to SESSIONED_LOCAL_ADAPTERS` | Directly touches heartbeat session behavior and Hermes support, which are both active fork concerns. |
| `7463479f` | `fix: disable HTTP caching on run log endpoints` | Small, contained hardening on observability surfaces with low merge risk. |
| `0d87fd9a` | `fix: proper cache headers for static assets and SPA fallback` | Targeted server-side caching fix with clear runtime value and limited blast radius. |
| `6059c665` | `fix(a11y): remove maximum-scale and user-scalable=no from viewport` | Tiny, safe accessibility fix with no architectural tradeoff. |
| `c1a02497` | `[codex] fix worktree dev dependency ergonomics` | High ROI for the current fork workflow because we actively use worktrees and have already hit dev dependency friction. |
| `3fa5d25d` | `[codex] harden heartbeat run summaries and recovery context` | Heartbeat/recovery continues to be a hot path for this fork; this is likely worth absorbing with priority. |
| `d4c3899c` | `[codex] improve issue and routine UI responsiveness` | User-facing Paperclip workflow improvement in a surface we are actively exercising. |
| `213bcd8c` | `fix: include routine-execution issues in agent inbox-lite` | Small, bounded data-shape fix in an active workflow surface. |
| `d0a8d4e0` | `fix(routines): include cronExpression and timezone in list trigger response` | Compact routines contract fix with clear product correctness benefit. |

### Evaluate with caution

| Commit | Summary | Why it needs review first |
| --- | --- | --- |
| `32a9165d` | `[codex] harden authenticated routes and issue editor reliability` | High-value theme, but wide surface area; likely overlaps with local findings and deserves file-by-file review before intake. |
| `50cd76d8` | `feat(adapters): add capability flags to ServerAdapterModule` | API/adapter contract expansion; useful, but not a blind cherry-pick into a fork with local adapter changes. |
| `f460f744` | `fix: trust PAPERCLIP_PUBLIC_URL in board mutation guard` | Potentially important deployment fix, but auth/mutation guards are sensitive enough to review against our local assumptions first. |
| `f6ce9765` | `fix: Anthropic subscription quota always shows 100% used` | Valuable if we actively depend on Anthropic quota reporting, but narrower than the heartbeat/workflow backlog. |
| `39050273` | `chore(ui): drop console.* and legal comments in production builds` | Build hygiene change that may be worth taking later, but not urgent compared to runtime/security work. |
| `5f457128` | `Sync/master post pap1497 followups 2026 04 15` | Bundled sync commit; likely contains multiple useful deltas, but should be decomposed before intake. |

### Ignore for now

| Commit | Summary | Why we can defer |
| --- | --- | --- |
| `b8725c52` | `release: v2026.416.0 notes` | Release-note churn only; no runtime or fork-behavior value. |

## Upstream Sync Order

When the scan-driven bug hunt cools down, the recommended upstream sync order is:

1. heartbeat / execution correctness (`1afb6be9`, `3fa5d25d`)
2. worktree and local-dev ergonomics (`c1a02497`)
3. runtime caching / transport correctness (`7463479f`, `0d87fd9a`, optionally `f460f744`)
4. routines / issue UI contract improvements (`213bcd8c`, `d0a8d4e0`, `d4c3899c`)
5. wider surface review commits (`32a9165d`, `50cd76d8`, `5f457128`)
6. low-priority hygiene (`39050273`, `b8725c52`)

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
